const functions = require("firebase-functions");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");
const twilio = require("twilio");

admin.initializeApp();

// Configuration fetching (Firebase configs set via: firebase functions:config:set sendgrid.key="..." etc.)
// In local emulation or absent config, we use mock fail-safe fallbacks
const SENDGRID_API_KEY = functions.config().sendgrid?.key || "SG.placeholder_key_for_local_testing";
const SENDGRID_FROM = functions.config().sendgrid?.from || "noreply@legacyvault.app";

const TWILIO_ACCOUNT_SID = functions.config().twilio?.sid || "AC_placeholder_sid";
const TWILIO_AUTH_TOKEN = functions.config().twilio?.token || "placeholder_token";
const TWILIO_FROM = functions.config().twilio?.from || "+1234567890";

// Set SendGrid key
sgMail.setApiKey(SENDGRID_API_KEY);

// Initialize Twilio client
let twilioClient;
if (TWILIO_ACCOUNT_SID !== "AC_placeholder_sid") {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

/**
 * 1. PASİF TETİKLEME MOTORU: Günlük Cron Job
 * Her 24 saatte bir çalışır.
 * - Eşik aşıldıysa: Ölü Adam Anahtarı tetiklenir, mirasçılara mail atılır.
 * - Eşik değerine 3 gün veya 1 gün kaldıysa: Cihaz sahibine SMS ve Email uyarıları gönderilir (False-Positive önleme).
 */
exports.checkDeadMansSwitch = functions.pubsub.schedule("every 24 hours").onRun(async (context) => {
  const now = admin.firestore.Timestamp.now();
  const db = admin.firestore();
  
  const usersSnapshot = await db.collection("users").get();
  
  for (const doc of usersSnapshot.docs) {
    const userData = doc.data();
    
    if (userData.lastActive && userData.deadMansSwitchEnabled && !userData.switchTriggered && userData.releaseStatus !== 'pending_release') {
      const lastActiveSeconds = userData.lastActive.seconds;
      const thresholdDays = userData.thresholdDays || 30;
      const thresholdSeconds = thresholdDays * 24 * 60 * 60;
      
      const secondsPassed = now.seconds - lastActiveSeconds;
      const daysPassed = secondsPassed / (24 * 60 * 60);

      if (secondsPassed > thresholdSeconds) {
        // A. EŞİK AŞILDI: KASAYI TETİKLE / MULTI-SIG KONTROLÜ
        console.log(`Threshold exceeded for user ${doc.id} (${userData.email})`);
        
        // Only count ACTIVE co-signers (not pending ones)
        const coSignersQuery = await db.collection("users").doc(doc.id).collection("trusted_contacts")
          .where("isCoSigner", "==", true)
          .where("status", "==", "active")
          .get();
        
        const activeCoSignerCount = coSignersQuery.size;
        
        if (activeCoSignerCount >= 2) {
          // Multi-sig required: place vault in pending state and notify co-signers
          console.log(`Pending release for user ${doc.id} (${activeCoSignerCount} active co-signers must approve)`);
          await db.collection("users").doc(doc.id).update({
            releaseStatus: 'pending_release',
            pendingReleaseAt: now,
            requiredCoSigners: activeCoSignerCount
          });
          await sendCoSignerNotifications(doc.id, userData.email, coSignersQuery.docs.map(d => d.data().email));
        } else {
          // No multi-sig setup (0 or 1 co-signer): release immediately
          console.log(`Triggering switch for user ${doc.id} (${userData.email}) - no multi-sig required`);
          await db.collection("users").doc(doc.id).update({
            switchTriggered: true,
            releaseStatus: 'released',
            triggeredAt: now
          });
          await sendInheritanceNotifications(doc.id, userData.email);
        }
        
      } else if (daysPassed >= (thresholdDays - 1) && daysPassed < thresholdDays) {
        // B. 1 GÜN KALDI UYARISI
        console.log(`Sending 1-day warning to user ${doc.id} (${userData.email})`);
        await sendWarningNotification(userData.email, userData.phone, 1);
        
      } else if (daysPassed >= (thresholdDays - 3) && daysPassed < (thresholdDays - 2)) {
        // C. 3 GÜN KALDI UYARISI
        console.log(`Sending 3-day warning to user ${doc.id} (${userData.email})`);
        await sendWarningNotification(userData.email, userData.phone, 3);
      }
    }
  }
  
  return null;
});

/**
 * 2. AKTİF TETİKLEME MOTORU: Resmi Ölüm Belgesi Doğrulama Sistemi
 * Bir talep (claim) yönetici tarafından 'approved' (onaylandı) yapıldığında tetiklenir.
 * Kasayı anında aktif eder veya Co-Signer onayı gerekiyorsa onay sürecini başlatır.
 */
exports.onClaimApproved = functions.firestore
  .document("claims/{claimId}")
  .onUpdate(async (change, context) => {
    const nextData = change.after.data();
    const prevData = change.before.data();
    
    // Yalnızca durum 'pending' -> 'approved' olduğunda çalış
    if (nextData.status === "approved" && prevData.status !== "approved") {
      const deceasedEmail = nextData.deceasedEmail;
      
      // Firestore'da bu e-postaya ait kullanıcıyı bul
      const userQuery = await admin.firestore()
        .collection("users")
        .where("email", "==", deceasedEmail)
        .limit(1)
        .get();
        
      if (userQuery.empty) {
        console.error(`Deceased user email ${deceasedEmail} not found in database.`);
        return;
      }
      
      const deceasedUserDoc = userQuery.docs[0];
      const deceasedUid = deceasedUserDoc.id;
      
      console.log(`Death claim APPROVED for deceased user ${deceasedUid} (${deceasedEmail})`);
      
      const coSignersQuery = await admin.firestore()
        .collection("users")
        .doc(deceasedUid)
        .collection("trusted_contacts")
        .where("isCoSigner", "==", true)
        .get();
      
      if (coSignersQuery.size >= 2) {
        console.log(`Death claim APPROVED. Release is PENDING CO-SIGNERS for deceased user ${deceasedUid}`);
        await admin.firestore().collection("users").doc(deceasedUid).update({
          releaseStatus: 'pending_release',
          pendingReleaseAt: admin.firestore.Timestamp.now()
        });
        await sendCoSignerNotifications(deceasedUid, deceasedEmail, coSignersQuery.docs.map(d => d.data().email));
      } else {
        console.log(`Death claim APPROVED. Triggering switch immediately for user ${deceasedUid}`);
        await admin.firestore().collection("users").doc(deceasedUid).update({
          switchTriggered: true,
          releaseStatus: 'released',
          triggeredAt: admin.firestore.Timestamp.now()
        });
        await sendInheritanceNotifications(deceasedUid, deceasedEmail);
      }
    }
  });

/**
 * 3. CO-SIGNER ONAYLAMA MOTORU
 * Bir Co-signer 'approvedRelease: true' olarak işaretlediğinde çalışır.
 * 2 co-signer onayı varsa kasayı tamamen açar.
 */
exports.onCoSignerApproval = functions.firestore
  .document("users/{userId}/trusted_contacts/{contactId}")
  .onUpdate(async (change, context) => {
    const nextData = change.after.data();
    const prevData = change.before.data();
    const userId = context.params.userId;
    
    // Yalnızca onay 'approvedRelease' alanı true yapıldığında tetiklenir
    if (nextData.isCoSigner && nextData.approvedRelease === true && prevData.approvedRelease !== true) {
      const db = admin.firestore();
      
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) return;
      const userData = userDoc.data();
      
      if (userData.releaseStatus === 'pending_release') {
        const coSignersSnapshot = await db.collection("users").doc(userId).collection("trusted_contacts").where("isCoSigner", "==", true).get();
        const approvedCount = coSignersSnapshot.docs.filter(doc => doc.data().approvedRelease === true).length;
        
        console.log(`User ${userId} has ${approvedCount} approved co-signers.`);
        
        if (approvedCount >= 2) {
          console.log(`Releasing vault for user ${userId} since 2 co-signers approved.`);
          await userRef.update({
            releaseStatus: 'released',
            switchTriggered: true,
            triggeredAt: admin.firestore.Timestamp.now()
          });
          
          await sendInheritanceNotifications(userId, userData.email);
        }
      }
    }
  });

/**
 * Yardımcı Fonksiyon: Mirasçılara gizli kilit açma mesajlarını yollar
 */
async function sendInheritanceNotifications(deceasedUid, deceasedEmail) {
  const db = admin.firestore();
  
  // Güvenilir kişileri çek
  const contactsSnapshot = await db.collection("users").doc(deceasedUid).collection("trusted_contacts").get();
  const emails = contactsSnapshot.docs.map(c => c.data().email).filter(e => e);
  
  if (emails.length > 0) {
    const msg = {
      to: emails,
      from: SENDGRID_FROM,
      subject: "Urgent: Legacy Vault Access Inherited",
      text: `Hello,\n\nYou have been listed as a trusted contact by ${deceasedEmail}.\nTheir Legacy Vault has been unlocked.\nPlease click this link to access their secure digital heritage: https://legacyvault.app/claim\n\nLegacy Vault Team`,
      html: `
        <div style="font-family: sans-serif; padding: 30px; background-color: #0A0E17; color: #ffffff; border-radius: 12px;">
          <h2 style="color: #AB47BC;">Legacy Vault</h2>
          <p>Hello,</p>
          <p>You have been listed as a trusted beneficiary by <strong>${deceasedEmail}</strong>.</p>
          <p style="color: #EF5350; font-weight: bold; font-size: 16px;">
            Their Legacy Vault has been unlocked.
          </p>
          <p>You are now authorized to securely decrypt and view their passwords, crypto seed keys, time-locked video messages, and legal documents.</p>
          <div style="margin: 28px 0;">
            <a href="https://legacyvault.app/claim" style="background: linear-gradient(to right, #AB47BC, #26C6DA); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">
              ACCESS DIGITAL HERITAGE
            </a>
          </div>
          <p style="font-size: 11px; color: #8899AA;">Securely delivered via client-side zero-knowledge AES-256 decryption algorithms.</p>
        </div>
      `
    };
    
    try {
      if (SENDGRID_API_KEY !== "SG.placeholder_key_for_local_testing") {
        await sgMail.sendMultiple(msg);
      }
      console.log(`Successfully sent inheritance emails to: ${emails.join(", ")}`);
    } catch (err) {
      console.error("Failed to send SendGrid e-mails:", err);
    }
  } else {
    console.log(`Deceased user ${deceasedUid} has no trusted contacts.`);
  }
}

/**
 * Yardımcı Fonksiyon: Cihaz sahibine false-positive engellemek için uyarı SMS ve E-postası yollar
 */
async function sendWarningNotification(email, phone, daysLeft) {
  // 1. E-posta uyarısı yolla
  const emailMsg = {
    to: email,
    from: SENDGRID_FROM,
    subject: `Urgent: Legacy Vault Heartbeat Warning - ${daysLeft} Days Left`,
    text: `Legacy Vault Alert: We noticed you haven't logged in. Your vault will trigger and release data in ${daysLeft} days. Log in to prevent this.`,
    html: `
      <div style="font-family: sans-serif; padding: 25px; border: 1px solid #FFA726; border-radius: 12px; background-color: #0A0E17; color: #ffffff;">
        <h2 style="color: #FFA726;">⚠️ Legacy Vault Warning</h2>
        <p>Hello,</p>
        <p>Our system has detected inactivity on your Legacy Vault account.</p>
        <p style="color: #FFA726; font-weight: bold; font-size: 16px;">
          Your vault is scheduled to trigger and release in ${daysLeft} day(s)!
        </p>
        <p>If this is a mistake, simply log into the Legacy Vault app or click the button below to send an instant "I am Alive" pulse and reset the timer.</p>
        <div style="margin: 24px 0;">
          <a href="https://legacyvault.app" style="background-color: #FFA726; color: #0A0E17; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">
            I AM ALIVE (RESET TIMER)
          </a>
        </div>
        <p style="font-size: 11px; color: #8899AA;">This is an automated safety alert to prevent accidental data release.</p>
      </div>
    `
  };

  try {
    if (SENDGRID_API_KEY !== "SG.placeholder_key_for_local_testing") {
      await sgMail.send(emailMsg);
    }
    console.log(`E-mail warning sent successfully to ${email}`);
  } catch (err) {
    console.error("Failed to send SendGrid warning email:", err);
  }

  // 2. SMS Uyarısı yolla (Twilio)
  if (phone && twilioClient) {
    try {
      await twilioClient.messages.create({
        body: `Legacy Vault Alert: We haven't heard from you. Your secure vault is scheduled to trigger in ${daysLeft} day(s). Log in to legacyvault.app now to reset the timer!`,
        from: TWILIO_FROM,
        to: phone
      });
      console.log(`Twilio SMS warning sent successfully to ${phone}`);
    } catch (err) {
      console.error("Failed to send Twilio SMS warning:", err);
    }
  }
}

/**
 * Yardımcı Fonksiyon: Co-signer'lara onay bekleyen talepler için bildirim yollar
 */
async function sendCoSignerNotifications(ownerUid, ownerEmail, coSignerEmails) {
  const emails = coSignerEmails.filter(e => e);
  if (emails.length === 0) return;
  
  const msg = {
    to: emails,
    from: SENDGRID_FROM,
    subject: "Urgent: Legacy Vault Approval Required",
    text: `Hello,\n\nYou are a designated Co-Signer for ${ownerEmail}.\nTheir Legacy Vault release has been triggered and is pending your approval.\nPlease log into your dashboard to approve or reject this request: https://legacyvault.app\n\nLegacy Vault Team`,
    html: `
      <div style="font-family: sans-serif; padding: 30px; background-color: #0A0E17; color: #ffffff; border-radius: 12px;">
        <h2 style="color: #FFA726;">🛡️ Legacy Vault Release Request</h2>
        <p>Hello,</p>
        <p>You are a designated <strong>Co-Signer</strong> for <strong>${ownerEmail}</strong>.</p>
        <p style="color: #FFA726; font-weight: bold; font-size: 16px;">
          Their Legacy Vault release has been triggered and is currently pending co-signer approval.
        </p>
        <p>In order to release their digital assets and time-locked secrets, at least 2 co-signers must approve this request.</p>
        <div style="margin: 28px 0;">
          <a href="https://legacyvault.app" style="background-color: #C9A84C; color: #0A0E17; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">
            APPROVE RELEASE REQUEST
          </a>
        </div>
        <p style="font-size: 11px; color: #8899AA;">Securely authenticated via client-side multi-sig authorization protocol.</p>
      </div>
    `
  };
  
  try {
    if (SENDGRID_API_KEY !== "SG.placeholder_key_for_local_testing") {
      await sgMail.sendMultiple(msg);
    }
    console.log(`Sent co-signer notification emails to: ${emails.join(", ")}`);
  } catch (err) {
    console.error("Failed to send co-signer notifications:", err);
  }
}

/**
 * 4. OTOMATİK BAĞLANTI MOTORU: Yeni Kullanıcı Kaydı
 * Bir kullanıcı sisteme kaydolduğunda çalışır.
 * - Diğer kullanıcıların trusted_contacts listesinde "pending" olarak bekleyen bu e-posta varsa,
 *   bu kaydı otomatik olarak "active" yapar ve UID + publicKey bilgilerini günceller.
 */
exports.onUserCreated = functions.auth.user().onCreate(async (userRecord) => {
  const db = admin.firestore();
  const newEmail = userRecord.email ? userRecord.email.toLowerCase() : null;
  
  if (!newEmail) {
    console.log("New user has no email, skipping pending contact resolution.");
    return null;
  }
  
  console.log(`New user registered: ${userRecord.uid} (${newEmail}) — searching for pending contacts...`);
  
  try {
    // Search all users' trusted_contacts for any "pending" contact with matching email
    const allUsersSnap = await db.collection("users").get();
    
    const batch = db.batch();
    let updateCount = 0;
    
    for (const userDoc of allUsersSnap.docs) {
      const ownerId = userDoc.id;
      if (ownerId === userRecord.uid) continue; // Skip self
      
      // Look for pending contacts matching new email
      const pendingContactSnap = await db
        .collection("users")
        .doc(ownerId)
        .collection("trusted_contacts")
        .where("email", "==", newEmail)
        .where("status", "==", "pending")
        .get();
      
      for (const pendingDoc of pendingContactSnap.docs) {
        console.log(`Activating pending contact ${pendingDoc.id} for owner ${ownerId}`);
        
        // Get the new user's profile to find publicKey
        const newUserProfile = await db.collection("users").doc(userRecord.uid).get();
        const publicKey = newUserProfile.exists ? (newUserProfile.data().publicKey || null) : null;
        
        // Move to new UID-based doc and delete pending one
        const newDocRef = db.collection("users").doc(ownerId).collection("trusted_contacts").doc(userRecord.uid);
        
        batch.set(newDocRef, {
          ...pendingDoc.data(),
          uid: userRecord.uid,
          publicKey: publicKey,
          status: 'active',
          activatedAt: admin.firestore.Timestamp.now()
        });
        
        // Delete the old pending doc if it has different ID
        if (pendingDoc.id !== userRecord.uid) {
          batch.delete(pendingDoc.ref);
        }
        
        updateCount++;
      }
    }
    
    if (updateCount > 0) {
      await batch.commit();
      console.log(`Successfully activated ${updateCount} pending contact(s) for new user ${userRecord.uid} (${newEmail})`);
    } else {
      console.log(`No pending contacts found for new user ${newEmail}`);
    }
    
    return null;
  } catch (err) {
    console.error("Error in onUserCreated pending contact resolution:", err);
    return null;
  }
});
