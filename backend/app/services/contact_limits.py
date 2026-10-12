"""Conservative Postmark attachment envelope, mirrored in contactLimits.ts."""

ATTACHMENT_ENVELOPE_BYTES = 8_000_000  # Leaves 2 MB for bodies, MIME and metadata.
ATTACHMENT_OVERHEAD_BYTES = 1024
CONTACT_ENVELOPE_MESSAGE = 'Attachments are too large to send together. Please use smaller files.'


def encoded_attachment_bytes(size, filename, content_type):
    return 4 * ((size + 2) // 3) + len(filename.encode()) + len(content_type.encode()) + ATTACHMENT_OVERHEAD_BYTES
