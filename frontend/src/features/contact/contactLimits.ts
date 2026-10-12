export const CONTACT_ENVELOPE_MESSAGE = "Attachments are too large to send together. Please use smaller files.";
export function contactAttachmentBytes(files: Pick<File, 'size' | 'name' | 'type'>[]): number {
  const utf8 = new TextEncoder();
  return files.reduce((total, file) => total + 4 * Math.ceil(file.size / 3)
    + utf8.encode(file.name.trim() || 'attachment').length
    + utf8.encode(file.type || 'application/octet-stream').length + 1024, 0);
}
export const CONTACT_ATTACHMENT_ENVELOPE_BYTES = 8_000_000;
