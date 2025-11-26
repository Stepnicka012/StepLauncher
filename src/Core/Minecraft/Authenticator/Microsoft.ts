import { Buffer } from 'node:buffer';
import crypto from 'crypto';

export type MicrosoftClientType = 'electron';

export interface MinecraftSkin {
	id?: string;
	state?: string;
	url?: string;
	variant?: string;
	alias?: string;
	base64?: string;
}

export interface MinecraftProfile {
	id: string;
	name: string;
	skins?: MinecraftSkin[];
	capes?: MinecraftSkin[];
}

export interface AuthError {
	error: string;
	errorType?: string;
	[key: string]: any;
}

export interface AuthResponse {
	access_token: string;
	client_token: string;
	uuid: string;
	name: string;
	refresh_token: string;
	user_properties: string;
	meta: {
		type: 'Xbox';
		access_token_expires_in: number;
		demo: boolean;
	};
	xboxAccount: {
		xuid: string;
		gamertag: string;
		ageGroup: string;
	};
	profile: {
		skins?: MinecraftSkin[];
		capes?: MinecraftSkin[];
	};
}

async function getBase64(url: string): Promise<string> {
	const response = await fetch(url);
	if (response.ok) {
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		return buffer.toString('base64');
	} else {
		return '';
	}
}

export default class Microsoft {

	public client_id: string;
	public type: MicrosoftClientType;

	constructor(client_id: string) {
		if (!client_id) {
			client_id = '00000000402b5328';
		}
		this.client_id = client_id;
		this.type = 'electron';
	}

		public async getAuth(url?: string): Promise<AuthResponse | AuthError | false> {
		const finalUrl = url || `https://login.live.com/oauth20_authorize.srf?client_id=${this.client_id}&response_type=code&redirect_uri=https://login.live.com/oauth20_desktop.srf&scope=XboxLive.signin%20offline_access&cobrandid=8058f65d-ce06-4c30-9559-473c9275a65d&prompt=select_account`;

		const userCode = await import('./Electron.js').then(m => m.default(finalUrl));
		if (userCode === 'cancel') return false;

		return this.exchangeCodeForToken(userCode!);
	}

	private async exchangeCodeForToken(code: string): Promise<AuthResponse | AuthError> {
		try {
			const response = await fetch('https://login.live.com/oauth20_token.srf', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: `client_id=${this.client_id}&code=${code}&grant_type=authorization_code&redirect_uri=https://login.live.com/oauth20_desktop.srf`
			});
			const oauth2 = await response.json();

			if (oauth2.error) {
				return { error: oauth2.error, errorType: 'oauth2', ...oauth2 };
			}
			return this.getAccount(oauth2);
		} catch (err: any) {
			return { error: err.message, errorType: 'network' };
		}
	}

	public async refresh(acc: AuthResponse | any): Promise<AuthResponse | AuthError> {
		const timeStamp = Math.floor(Date.now());
		if (timeStamp < (acc?.meta?.access_token_expires_in - 7200)) {
			const updatedProfile = await this.getProfile({ access_token: acc.access_token });
			if ('error' in updatedProfile) {
				return updatedProfile;
			}
			acc.profile = {
				skins: updatedProfile.skins,
				capes: updatedProfile.capes
			};
			return acc;
		}

		try {
			const response = await fetch('https://login.live.com/oauth20_token.srf', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: `grant_type=refresh_token&client_id=${this.client_id}&refresh_token=${acc.refresh_token}`
			});
			const oauth2 = await response.json();

			if (oauth2.error) {
				return { error: oauth2.error, errorType: 'oauth2', ...oauth2 };
			}
			return this.getAccount(oauth2);
		} catch (err: any) {
			return { error: err.message, errorType: 'network' };
		}
	}

	private async getAccount(oauth2: any): Promise<AuthResponse | AuthError> {
		const authenticateResponse = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			body: JSON.stringify({
				Properties: {
					AuthMethod: 'RPS',
					SiteName: 'user.auth.xboxlive.com',
					RpsTicket: `d=${oauth2.access_token}`,
				},
				RelyingParty: 'http://auth.xboxlive.com',
				TokenType: 'JWT',
			}),
		});
		const xbl = await authenticateResponse.json();

		if (xbl.error) {
			return { error: xbl.error, errorType: 'xbl', ...xbl, refresh_token: oauth2.refresh_token };
		}

		const authorizeResponse = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			body: JSON.stringify({
				Properties: {
					SandboxId: 'RETAIL',
					UserTokens: [xbl.Token],
				},
				RelyingParty: 'rp://api.minecraftservices.com/',
				TokenType: 'JWT',
			}),
		});
		const xsts = await authorizeResponse.json();

		if (xsts.error) {
			return { error: xsts.error, errorType: 'xsts', ...xsts, refresh_token: oauth2.refresh_token };
		}

		const mcLoginResponse = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			body: JSON.stringify({
				identityToken: `XBL3.0 x=${xbl.DisplayClaims.xui[0].uhs};${xsts.Token}`
			}),
		});
		const mcLogin = await mcLoginResponse.json();

		if (mcLogin.error) {
			return { error: mcLogin.error, errorType: 'mcLogin', ...mcLogin, refresh_token: oauth2.refresh_token };
		}
		if (!mcLogin.username) {
			return { error: 'NO_MINECRAFT_ACCOUNT', errorType: 'mcLogin', ...mcLogin, refresh_token: oauth2.refresh_token };
		}

		const mcstoreResponse = await fetch('https://api.minecraftservices.com/entitlements/mcstore', {
			method: 'GET',
			headers: { 'Authorization': `Bearer ${mcLogin.access_token}` },
		});
		const mcstore = await mcstoreResponse.json();

		if (mcstore.error) {
			return { error: mcstore.error, errorType: 'mcStore', ...mcstore, refresh_token: oauth2.refresh_token };
		}

		if (!mcstore.items.some((item: { name: string }) =>
			item.name === "game_minecraft" || item.name === "product_minecraft"
		)) {
			return { error: 'NO_MINECRAFT_ENTITLEMENTS', errorType: 'mcStore', ...mcstore, refresh_token: oauth2.refresh_token };
		}

		const profile = await this.getProfile(mcLogin);

		if ('error' in profile) {
			return {
				...profile,
				error: profile.error,
				errorType: 'mcProfile',
				refresh_token: oauth2.refresh_token
			};
		}

		const xboxAccountResponse = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				Properties: {
					SandboxId: 'RETAIL',
					UserTokens: [xbl.Token]
				},
				RelyingParty: 'http://xboxlive.com',
				TokenType: 'JWT'
			})
		});
		const xboxAccount = await xboxAccountResponse.json();

		if (xboxAccount.error) {
			return { error: xboxAccount.error, errorType: 'xboxAccount', ...xboxAccount, refresh_token: oauth2.refresh_token };
		}

		return {
			access_token: mcLogin.access_token,
			client_token: crypto.randomUUID(),
			uuid: profile.id,
			name: profile.name,
			refresh_token: oauth2.refresh_token,
			user_properties: "{}",
			meta: {
				type: 'Xbox',
				access_token_expires_in: Date.now() + (mcLogin.expires_in * 1000),
				demo: false
			},
			xboxAccount: {
				xuid: xboxAccount.DisplayClaims.xui[0].xid,
				gamertag: xboxAccount.DisplayClaims.xui[0].gtg,
				ageGroup: xboxAccount.DisplayClaims.xui[0].agg
			},
			profile: {
				skins: profile.skins ?? [],
				capes: profile.capes ?? []
			}
		};
	}

	public async getProfile(mcLogin: { access_token: string }): Promise<MinecraftProfile | AuthError> {
		try {
			const response = await fetch('https://api.minecraftservices.com/minecraft/profile', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${mcLogin.access_token}`
				}
			});
			const profile = await response.json();

			if (profile.error) {
				return { error: profile.error };
			}

			if (Array.isArray(profile.skins)) {
				for (const skin of profile.skins) {
					if (skin.url) {
						skin.base64 = `data:image/png;base64,${await getBase64(skin.url)}`;
					}
				}
			}

			if (Array.isArray(profile.capes)) {
				for (const cape of profile.capes) {
					if (cape.url) {
						cape.base64 = `data:image/png;base64,${await getBase64(cape.url)}`;
					}
				}
			}

			return {
				id: profile.id,
				name: profile.name,
				skins: profile.skins || [],
				capes: profile.capes || []
			};
		} catch (err: any) {
			return { error: err.message };
		}
	}
}
