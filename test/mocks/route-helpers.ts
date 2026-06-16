export function postJson(body: unknown, url = 'http://localhost/api/test') {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export function getUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, 'http://localhost');
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
