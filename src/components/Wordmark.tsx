/**
 * โลโก้ตัวอักษร "SuKhon Arena" — ตัว K สีทองพลิกตัวไปมาตลอดเวลา
 * เป็น CSS animation ล้วน (ดู .wordmark-k ใน globals.css) จึงใช้ใน server component ได้
 */
export function Wordmark() {
  return (
    <>
      Su<span className="wordmark-k">K</span>hon <span className="dot">Arena</span>
    </>
  );
}
