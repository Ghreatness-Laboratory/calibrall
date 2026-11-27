import { getLocalDatabase } from '@/lib/supabase/client';
import { getSupabaseServiceClient, type ServerAuthSession } from '@/lib/supabase/serverAuth';

function getEmailProviderConfig(): {
  configured: boolean;
  provider: 'resend' | null;
  apiKey: string;
  fromAddress: string;
  appUrl: string;
} {
  const apiKey = (
    process.env.EMAIL_API_KEY?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    ''
  );
  const rawProvider = (process.env.EMAIL_PROVIDER?.trim() || '').toLowerCase();
  const fromAddress =
    process.env.NOTIFICATION_FROM_ADDRESS?.trim() || 'Calibrall <no-reply@calibrall.app>';
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'https://calibrall.app';

  if (!apiKey) {
    return { configured: false, provider: null, apiKey: '', fromAddress, appUrl };
  }

  if (rawProvider && rawProvider !== 'resend') {
    return { configured: false, provider: null, apiKey: '', fromAddress, appUrl };
  }

  return {
    configured: true,
    provider: 'resend',
    apiKey,
    fromAddress,
    appUrl,
  };
}

async function claimReminderColumn(
  userId: string,
  column: 'trial_reminder_5d_sent_at' | 'trial_ended_email_sent_at',
  nowIso: string
): Promise<boolean> {
  const serviceClient = getSupabaseServiceClient();
  if (serviceClient) {
    const { data, error } = await serviceClient
      .from('profiles')
      .update({ [column]: nowIso })
      .eq('id', userId)
      .is(column, null)
      .select('id');
    return !error && Array.isArray(data) && data.length > 0;
  }

  const db = getLocalDatabase();
  if (!db) return false;
  const info = db
    .prepare(`UPDATE profiles SET ${column} = ? WHERE id = ? AND ${column} IS NULL`)
    .run(nowIso, userId);
  return info.changes > 0;
}

async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      html: params.html,
    }),
  });
  return res.ok;
}

/**
 * Sends at most one email at 2 days remaining (Day 5) and one email when trial ends (Day 7).
 * Strictly no-ops if no email provider/key is configured.
 */
export async function maybeSendTrialReminderEmail(
  session: ServerAuthSession
): Promise<{ sent: '5d' | 'ended' | null }> {
  const cfg = getEmailProviderConfig();
  if (!cfg.configured || !session.user.email) {
    return { sent: null };
  }

  const { entitlements, profile, user } = session;
  if (entitlements.status === 'admin' || entitlements.status === 'paid') {
    return { sent: null };
  }

  const nowIso = new Date().toISOString();

  // Day 5+ (<= 2 days left in trial)
  if (
    entitlements.status === 'trial' &&
    entitlements.trialDaysRemaining <= 2 &&
    !profile.trialReminder5dSentAt
  ) {
    const claimed = await claimReminderColumn(user.id, 'trial_reminder_5d_sent_at', nowIso);
    if (!claimed) return { sent: null };

    const days = entitlements.trialDaysRemaining;
    const dayWord = days === 1 ? 'day' : 'days';
    const pricingUrl = `${cfg.appUrl}/pricing`;

    try {
      await sendResendEmail({
        apiKey: cfg.apiKey,
        from: cfg.fromAddress,
        to: user.email,
        subject: `Calibrall trial: ${days} ${dayWord} left`,
        text: `Your Calibrall 7-day free trial has ${days} ${dayWord} remaining. Choose Pro or Premium to keep viewing predictions and model breakdowns: ${pricingUrl}`,
        html: `<p>Your Calibrall 7-day free trial has <strong>${days} ${dayWord}</strong> remaining.</p><p>Choose Pro or Premium before it ends to keep viewing model predictions and records: <a href="${pricingUrl}">${pricingUrl}</a></p>`,
      });
      return { sent: '5d' };
    } catch {
      return { sent: null };
    }
  }

  // Day 7 / Trial ended
  if (
    entitlements.status === 'expired' &&
    profile.trialEndsAt &&
    !profile.trialEndedEmailSentAt
  ) {
    const claimed = await claimReminderColumn(user.id, 'trial_ended_email_sent_at', nowIso);
    if (!claimed) return { sent: null };

    const pricingUrl = `${cfg.appUrl}/pricing?reason=trial_ended`;
    try {
      await sendResendEmail({
        apiKey: cfg.apiKey,
        from: cfg.fromAddress,
        to: user.email,
        subject: 'Your Calibrall 7-day free trial has ended',
        text: `Your 7-day free trial has ended. Choose Pro or Premium to restore immediate access to Calibrall models: ${pricingUrl}`,
        html: `<p>Your Calibrall 7-day free trial has ended.</p><p>Choose a Pro or Premium plan to restore access immediately: <a href="${pricingUrl}">${pricingUrl}</a></p>`,
      });
      return { sent: 'ended' };
    } catch {
      return { sent: null };
    }
  }

  return { sent: null };
}
