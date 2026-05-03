let token: string | null = null;

export function getAuthToken() {
  return token;
}

export function setAuthToken(nextToken: string | null) {
  token = nextToken;
}
