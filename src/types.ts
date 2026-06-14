export type Identity = {
  webId: string;
  displayName?: string;
  avatarUrl?: string;
  issuer?: string;
};

export type LoginArgs = {
  issuer: string;
  /** Present when the card collects credentials in-app (`credentials` prop). */
  username?: string;
  password?: string;
};

export type LoginHandler = (args: LoginArgs) => void | Promise<void>;
