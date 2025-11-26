import crypto from 'crypto';

let api_url = 'https://authserver.mojang.com';

interface MojangUser {
	access_token: string;
	client_token: string;
	uuid: string;
	name: string;
	user_properties: string;
	meta: {
		online: boolean;
		type: string;
	};
	error?: boolean;
	message?: string;
}

interface MojangResponse {
	accessToken?: string;
	clientToken?: string;
	selectedProfile?: { id: string; name: string };
	error?: boolean;
	message?: string;
}

async function login(username: string, password?: string): Promise<MojangUser | MojangResponse> {
	const UUID = crypto.randomBytes(16).toString('hex');

	if (!password) {
		return {
			access_token: UUID,
			client_token: UUID,
			uuid: UUID,
			name: username,
			user_properties: '{}',
			meta: { online: false, type: 'Mojang' }
		};
	}

	const response = await fetch(`${api_url}/authenticate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			agent: { name: 'Minecraft', version: 1 },
			username,
			password,
			clientToken: UUID,
			requestUser: true
		})
	});

	const message = (await response.json()) as MojangResponse;

	if (message.error) return message;
	const selectedProfile = message.selectedProfile!;
	return {
		access_token: message.accessToken!,
		client_token: message.clientToken!,
		uuid: selectedProfile.id,
		name: selectedProfile.name,
		user_properties: '{}',
		meta: { online: true, type: 'Mojang' }
	};
}

async function refresh(acc: MojangUser): Promise<MojangUser | MojangResponse> {
	const response = await fetch(`${api_url}/refresh`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			accessToken: acc.access_token,
			clientToken: acc.client_token,
			requestUser: true
		})
	});

	const message = (await response.json()) as MojangResponse;

	// ES/EN: Error de Mojang.
	if (message.error) return message;

	const selectedProfile = message.selectedProfile!;
	return {
		access_token: message.accessToken!,
		client_token: message.clientToken!,
		uuid: selectedProfile.id,
		name: selectedProfile.name,
		user_properties: '{}',
		meta: { online: true, type: 'Mojang' }
	};
}

async function validate(acc: MojangUser): Promise<boolean> {
	const response = await fetch(`${api_url}/validate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ accessToken: acc.access_token, clientToken: acc.client_token })
	});

	return response.status === 204;
}

async function signout(acc: MojangUser): Promise<boolean> {
	const response = await fetch(`${api_url}/invalidate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ accessToken: acc.access_token, clientToken: acc.client_token })
	});
	const text = await response.text();
	return text === '';
}

function ChangeAuthApi(url: string) {
	api_url = url;
}

export { login, refresh, validate, signout, ChangeAuthApi };
