/** The hosting limit applies to the complete multipart request, in decimal bytes. */
export const MAX_ATTACHMENT_REQUEST_BYTES = 4_500_000;
/** Reserve room for the multipart boundary, scope, MIME type, and filename. */
export const MAX_ATTACHMENT_UPLOAD_BYTES = MAX_ATTACHMENT_REQUEST_BYTES - 16 * 1024;
/** Rounded upload limit displayed by all attachment composers. */
export const MAX_ATTACHMENT_UPLOAD_MB = 4.5;
