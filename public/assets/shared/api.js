export async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    const wrappedError = new Error(error?.message || '\u8bf7\u6c42\u5931\u8d25');
    wrappedError.status = 0;
    wrappedError.url = url;
    wrappedError.cause = error;
    throw wrappedError;
  }

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    const message = data.error || `${response.status} ${response.statusText || '\u8bf7\u6c42\u5931\u8d25'}`;
    const error = new Error(message);
    error.status = response.status;
    error.url = url;
    error.data = data;
    throw error;
  }

  return data;
}
