// Mobile numbers are stored as exactly 10 digits (R41). Pasted "+91 98220 12345" or "098220 12345" become "9822012345".

/** Digits only, without a leading +91 / 91 / 0. Doesn't cut extra digits (so validation can catch them). */
export function normalizeMobile(s: string | null | undefined): string {
  let d = (s ?? "").replace(/\D/g, "").replace(/^0+/, ""); // Indian mobiles never start with 0
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  return d;
}

export const MOBILE_RE = /^\d{10}$/;
export const MOBILE_ERROR = "Enter a 10-digit mobile number.";

/** For WhatsApp: country code + number ("919822012345"). */
export const waNumber = (s: string | null | undefined) => {
  const d = normalizeMobile(s);
  return d.length === 10 ? `91${d}` : d;
};

/**
 * Opens WhatsApp with the message ready (R41). On a computer it goes to WhatsApp Web in one named tab, so every later
 * message from the CRM reuses that same tab instead of opening a new one each time. Phones (and the Android app) open
 * the WhatsApp app. Must be called inside the click, or the browser blocks it.
 */
export function openWhatsApp(mobile: string | null | undefined, text?: string) {
  const phone = waNumber(mobile);
  const phoneLike = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (phoneLike) {
    window.open(`https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`, "_blank", "noopener");
    return;
  }
  const url = `https://web.whatsapp.com/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  // Same window name every time → the browser reuses the WhatsApp tab the CRM opened before (keeping the opener
  // link is what lets it find that tab again). A WhatsApp tab the user opened by hand can't be reached by any website.
  window.open(url, "wl_whatsapp")?.focus();
}
