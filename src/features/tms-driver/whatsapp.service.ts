/**
 * WhatsApp Service
 *
 * Sends OTP codes via the WhatsApp Cloud API using the approved "login_code"
 * Authentication-category template (Copy Code delivery — no app package/
 * signature-hash auto-fill wiring needed).
 */

import { logger } from "@/util/logger";
import { env } from "@/env";

const GRAPH_API_VERSION = "v21.0";
const OTP_TEMPLATE_NAME = "login_code";
const OTP_TEMPLATE_LANGUAGE = "en_US";

/** Sends the OTP code to a phone number over WhatsApp. Returns false (does not throw) on failure so the caller can decide how to surface it. */
export async function sendWhatsappOtp(phone: string, code: string): Promise<boolean> {
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    logger.warn("[whatsapp] WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID not set — skipping send");
    return false;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: OTP_TEMPLATE_NAME,
      language: { code: OTP_TEMPLATE_LANGUAGE },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      logger.error(`❌ [whatsapp] Send failed (${res.status}): ${errText}`);
      return false;
    }
    logger.info(`✅ [whatsapp] OTP sent to ${phone}`);
    return true;
  } catch (err) {
    logger.error("❌ [whatsapp] Send error:", err);
    return false;
  }
}
