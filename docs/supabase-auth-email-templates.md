# QRguitar Supabase Auth Email Templates

Use these in Supabase under `Authentication -> Emails -> Templates`.

Sender name: `QRguitar`
Sender email: `noreply@qrguitar.com`
Reply-to: `support@qrguitar.com`
Brand color: `#f0a12b`
Background: `#070c10`

Keep the QRguitar wordmark image as the white/orange production logo when Supabase supports a logo URL. Do not use alternate QR-only marks.

## Confirm Signup

Subject:

```text
Confirm your QRguitar account
```

Body:

```html
<div style="margin:0;padding:28px;background:#070c10;color:#f8f6f2;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;border:1px solid rgba(248,246,242,.14);border-radius:14px;background:#11191e;padding:28px;">
    <div style="font-size:28px;font-weight:900;letter-spacing:-.02em;color:#f8f6f2;">QR<span style="color:#f0a12b;">guitar</span></div>
    <h1 style="margin:28px 0 10px;font-size:26px;line-height:1.15;color:#f8f6f2;">Confirm your account.</h1>
    <p style="margin:0 0 22px;color:rgba(248,246,242,.78);font-size:16px;line-height:1.6;">Finish setting up your QRguitar login so your instrument records, photos, documents, and QR links stay tied to your account.</p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;border-radius:10px;background:#f5f0df;color:#071014;padding:14px 20px;font-weight:900;text-decoration:none;">Confirm account</a>
    <p style="margin:24px 0 0;color:rgba(248,246,242,.58);font-size:13px;line-height:1.5;">If you did not create a QRguitar account, you can ignore this email.</p>
  </div>
</div>
```

## Password Reset

Subject:

```text
Reset your QRguitar password
```

Body:

```html
<div style="margin:0;padding:28px;background:#070c10;color:#f8f6f2;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;border:1px solid rgba(248,246,242,.14);border-radius:14px;background:#11191e;padding:28px;">
    <div style="font-size:28px;font-weight:900;letter-spacing:-.02em;color:#f8f6f2;">QR<span style="color:#f0a12b;">guitar</span></div>
    <h1 style="margin:28px 0 10px;font-size:26px;line-height:1.15;color:#f8f6f2;">Reset your password.</h1>
    <p style="margin:0 0 22px;color:rgba(248,246,242,.78);font-size:16px;line-height:1.6;">Use this secure link to create a new QRguitar password. Your instrument records and permanent QR URLs will not change.</p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;border-radius:10px;background:#f5f0df;color:#071014;padding:14px 20px;font-weight:900;text-decoration:none;">Reset password</a>
    <p style="margin:24px 0 0;color:rgba(248,246,242,.58);font-size:13px;line-height:1.5;">If you did not request a password reset, you can ignore this email. Need help? Contact support@qrguitar.com.</p>
  </div>
</div>
```

## Magic Link / Transfer Claim

Subject:

```text
Open your QRguitar secure link
```

Body:

```html
<div style="margin:0;padding:28px;background:#070c10;color:#f8f6f2;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;border:1px solid rgba(248,246,242,.14);border-radius:14px;background:#11191e;padding:28px;">
    <div style="font-size:28px;font-weight:900;letter-spacing:-.02em;color:#f8f6f2;">QR<span style="color:#f0a12b;">guitar</span></div>
    <h1 style="margin:28px 0 10px;font-size:26px;line-height:1.15;color:#f8f6f2;">Open your secure QRguitar link.</h1>
    <p style="margin:0 0 22px;color:rgba(248,246,242,.78);font-size:16px;line-height:1.6;">This link signs you in securely so you can continue with your QRguitar account or ownership transfer.</p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;border-radius:10px;background:#f5f0df;color:#071014;padding:14px 20px;font-weight:900;text-decoration:none;">Open secure link</a>
    <p style="margin:24px 0 0;color:rgba(248,246,242,.58);font-size:13px;line-height:1.5;">If you were not expecting this email, ignore it or contact support@qrguitar.com.</p>
  </div>
</div>
```
