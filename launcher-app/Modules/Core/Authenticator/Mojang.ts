import crypto from 'crypto';
import fs from 'fs';

// ES: URL base del servidor de autenticación (Mojang o Yggdrasil personalizado).
// EN: Base URL of the authentication server (Mojang or custom Yggdrasil).
let api_url = 'https://authserver.mojang.com';

interface MojangUser {
	access_token: string;
	client_token: string;
	uuid: string;
	name: string;
	user_properties: string; // JSON stringificado con texturas
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
	user?: {
		properties?: Array<{ name: string; value: string }>;
	};
	error?: boolean;
	message?: string;
}

interface TextureOptions {
	skinPath?: string;
	capePath?: string;
	skinUrl?: string;
	capeUrl?: string;
	skinModel?: 'slim' | 'classic';
}

async function login(
	username: string,
	password?: string,
	textures?: TextureOptions
): Promise<MojangUser | MojangResponse> {
	const UUID = crypto.randomBytes(16).toString('hex');

	if (!password) {
		const userProperties = await buildUserProperties(textures);
		
		return {
			access_token: UUID,
			client_token: UUID,
			uuid: UUID,
			name: username,
			user_properties: userProperties,
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
	
	let userProperties = '{}';
	
	if (message.user?.properties) {
		const texturesProperty = message.user.properties.find(p => p.name === 'textures');
		if (texturesProperty) {
			userProperties = JSON.stringify([texturesProperty]);
		}
	} else if (textures) {
		userProperties = await buildUserProperties(textures);
	}
	
	return {
		access_token: message.accessToken!,
		client_token: message.clientToken!,
		uuid: selectedProfile.id,
		name: selectedProfile.name,
		user_properties: userProperties,
		meta: { online: true, type: 'Mojang' }
	};
}

async function buildUserProperties(textures?: TextureOptions): Promise<string> {
	if (!textures) {
		return '{}';
	}

	const texturesData: any = {
		timestamp: Date.now(),
		profileId: crypto.randomBytes(16).toString('hex'),
		profileName: 'Player',
		textures: {}
	};

	if (textures.skinPath) {
		const skinUrl = await createLocalTextureUrl(textures.skinPath);
		texturesData.textures.SKIN = {
			url: skinUrl
		};
		
		if (textures.skinModel === 'slim') {
			texturesData.textures.SKIN.metadata = {
				model: 'slim'
			};
		}
	} else if (textures.skinUrl) {
		texturesData.textures.SKIN = {
			url: textures.skinUrl
		};
		
		if (textures.skinModel === 'slim') {
			texturesData.textures.SKIN.metadata = {
				model: 'slim'
			};
		}
	}

	if (textures.capePath) {
		const capeUrl = await createLocalTextureUrl(textures.capePath);
		texturesData.textures.CAPE = {
			url: capeUrl
		};
	} else if (textures.capeUrl) {
		texturesData.textures.CAPE = {
			url: textures.capeUrl
		};
	}

	const texturesJson = JSON.stringify(texturesData);
	const texturesBase64 = Buffer.from(texturesJson).toString('base64');

	return JSON.stringify([
		{
			name: 'textures',
			value: texturesBase64
		}
	]);
}

async function createLocalTextureUrl(filePath: string): Promise<string> {
	try {
		if (!fs.existsSync(filePath)) {
			throw new Error(`Texture file not found: ${filePath}`);
		}

		const fileBuffer = fs.readFileSync(filePath);
		const base64 = fileBuffer.toString('base64');
		return `data:image/png;base64,${base64}`;

		// return `file:///${path.resolve(filePath).replace(/\\/g, '/')}`;
		
	} catch (error) {
		console.error('[Auth] Error reading texture file:', error);
		throw error;
	}
}

function bufferToDataUrl(buffer: Buffer): string {
	const base64 = buffer.toString('base64');
	return `data:image/png;base64,${base64}`;
}

function isValidPNG(filePath: string): boolean {
	try {
		const buffer = fs.readFileSync(filePath);
		// PNG signature: 89 50 4E 47 0D 0A 1A 0A
		return buffer[0] === 0x89 &&
		       buffer[1] === 0x50 &&
		       buffer[2] === 0x4E &&
		       buffer[3] === 0x47;
	} catch {
		return false;
	}
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

	if (message.error) return message;

	const selectedProfile = message.selectedProfile!;
	
	let userProperties = '{}';
	if (message.user?.properties) {
		const texturesProperty = message.user.properties.find(p => p.name === 'textures');
		if (texturesProperty) {
			userProperties = JSON.stringify([texturesProperty]);
		}
	}
	
	return {
		access_token: message.accessToken!,
		client_token: message.clientToken!,
		uuid: selectedProfile.id,
		name: selectedProfile.name,
		user_properties: userProperties,
		meta: { online: true, type: 'Mojang' }
	};
}

async function validate(acc: MojangUser): Promise<boolean> {
	const response = await fetch(`${api_url}/validate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ 
			accessToken: acc.access_token, 
			clientToken: acc.client_token 
		})
	});

	return response.status === 204;
}

async function signout(acc: MojangUser): Promise<boolean> {
	const response = await fetch(`${api_url}/invalidate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ 
			accessToken: acc.access_token, 
			clientToken: acc.client_token 
		})
	});

	const text = await response.text();
	return text === '';
}

function ChangeAuthApi(url: string) {
	api_url = url;
}

function extractTextures(userProperties: string): {
	skinUrl?: string;
	capeUrl?: string;
	skinModel?: string;
} | null {
	try {
		const properties = JSON.parse(userProperties);
		if (!Array.isArray(properties)) return null;

		const texturesProp = properties.find(p => p.name === 'textures');
		if (!texturesProp) return null;

		const texturesJson = Buffer.from(texturesProp.value, 'base64').toString('utf-8');
		const texturesData = JSON.parse(texturesJson);

		const result: any = {};

		if (texturesData.textures?.SKIN) {
			result.skinUrl = texturesData.textures.SKIN.url;
			if (texturesData.textures.SKIN.metadata?.model) {
				result.skinModel = texturesData.textures.SKIN.metadata.model;
			}
		}

		if (texturesData.textures?.CAPE) {
			result.capeUrl = texturesData.textures.CAPE.url;
		}

		return result;
	} catch (error) {
		console.error('[Auth] Error extracting textures:', error);
		return null;
	}
}

export { 
	login, 
	refresh, 
	validate, 
	signout, 
	ChangeAuthApi,
	buildUserProperties,
	bufferToDataUrl,
	isValidPNG,
	extractTextures,
	type MojangUser,
	type TextureOptions
};