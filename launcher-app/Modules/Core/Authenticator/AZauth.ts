import { Buffer } from 'node:buffer';

interface AZauthUser {
	access_token?: string | undefined;
	client_token?: string | undefined;
	uuid?: string | undefined;
	name?: string | undefined;
	user_properties?: string;
	user_info?: {
		id?: string | undefined;
		banned?: boolean | undefined;
		money?: number | undefined;
		role?: string | undefined;
		verified?: boolean | undefined;
	} | undefined;
	meta?: {
		online: boolean;
		type: string;
	};
	profile?: {
		skins: Array<{
			url: string;
			base64?: string;
		}>;
	};

	error?: boolean | undefined;
	reason?: string | undefined;
	message?: string | undefined;
	A2F?: boolean;
}

interface AZauthResponse {
	status?: 'success' | 'error' | 'pending';
	reason?: string;
	message?: string;
	access_token?: string;
	uuid?: string;
	username?: string;
	id?: string;
	banned?: boolean;
	money?: number;
	role?: string;
	email_verified?: boolean;
}

export default class AZauth {
	private url: string;
	private skinAPI: string;

	constructor(url: string) {
		this.url = new URL('/api/auth', url).toString();
		this.skinAPI = new URL('/api/skin-api/skins', url).toString();
	}

	public async login(username: string, password: string, A2F: string | null = null): Promise<AZauthUser> {
		const response = await fetch(`${this.url}/authenticate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: username, password, code: A2F })
		});

		const data = (await response.json()) as AZauthResponse;

		if (data.status === 'pending' && data.reason === '2fa')
			return { A2F: true };

		if (data.status === 'error')
			return { error: true, reason: data.reason, message: data.message };

		const id = data.id;
		return {
			access_token: data.access_token,
			client_token: data.uuid,
			uuid: data.uuid,
			name: data.username,
			user_properties: '{}',
			user_info: {
				id,
				banned: data.banned,
				money: data.money ,
				role: data.role,
				verified: data.email_verified
			},
			meta: { online: false, type: 'AZauth' },
			profile: { skins: id ? [await this.skin(id)] : [] }
		};
	}

	public async verify(user: AZauthUser): Promise<AZauthUser> {
		const response = await fetch(`${this.url}/verify`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ access_token: user.access_token })
		});

		const data = (await response.json()) as AZauthResponse;

		if (data.status === 'error')
			return { error: true, reason: data.reason, message: data.message };

		const id = data.id;
		return {
			access_token: data.access_token,
			client_token: data.uuid,
			uuid: data.uuid,
			name: data.username,
			user_properties: '{}',
			user_info: {
				id,
				banned: data.banned,
				money: data.money,
				role: data.role,
				verified: data.email_verified
			},
			meta: { online: false, type: 'AZauth' },
			profile: { skins: id ? [await this.skin(id)] : [] }
		};
	}

	public async signout(user: AZauthUser): Promise<boolean> {
		const response = await fetch(`${this.url}/logout`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ access_token: user.access_token })
		});

		const data = (await response.json()) as { error?: boolean };
		return !data.error;
	}

	private async skin(uuid: string): Promise<{ url: string; base64?: string }> {
		const response = await fetch(`${this.skinAPI}/${uuid}`, { method: 'GET' });

		if (response.status === 404)
			return { url: `${this.skinAPI}/${uuid}` };

		const buffer = Buffer.from(await response.arrayBuffer());
		return {
			url: `${this.skinAPI}/${uuid}`,
			base64: `data:image/png;base64,${buffer.toString('base64')}`
		};
	}
}
