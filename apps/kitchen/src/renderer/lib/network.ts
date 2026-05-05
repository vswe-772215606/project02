export function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url) {
    return '';
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  const withoutProto = url.replace(/^https?:\/\//i, '');
  if (/^[^/:]+$/.test(withoutProto)) {
    url = `${url}:4000`;
  }

  return url.replace(/\/$/, '');
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unknown error';
}

export async function checkServerHealth(url: string, timeoutMs = 5000): Promise<void> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${url}/api/health`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } finally {
    window.clearTimeout(timeoutId);
  }
}
