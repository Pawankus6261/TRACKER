/**
 * Universal Clipboard Copy Helper
 * Supports both modern navigator.clipboard and fallback execCommand
 * for non-secure HTTP mobile contexts (e.g., http://10.x.x.x:5173).
 */
export async function copyToClipboard(text) {
  if (!text) return false;

  // 1. Try modern async Clipboard API (available in secure contexts)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, using fallback:', err);
    }
  }

  // 2. Legacy fallback for non-secure HTTP contexts on mobile/LAN
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  } catch (err) {
    console.error('execCommand fallback failed:', err);
    return false;
  }
}
