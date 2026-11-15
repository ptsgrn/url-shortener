export type SampleUser = { id: string; name: string; email: string };
export type SampleLink = { code: string; url: string; userId: string; createdAt: Date };

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

export const users: SampleUser[] = [
	{ id: 'u1', name: 'นาย อนุทิน ชอบกินกระถิน', email: 'anuthin@gmail.com' },
	{ id: 'u2', name: 'นาย ฉลาด ชาติเจริญ', email: 'chalard@gmail.com' }
];

export const links: SampleLink[] = [
	{
		code: 'abc123',
		url: 'https://docs.google.com/document/d/1a2b3c',
		userId: 'u1',
		createdAt: ago(2)
	},
	{ code: 'abc345', url: 'https://www.chula.ac.th/news/2026/', userId: 'u2', createdAt: ago(5) },
	{
		code: 'abc127',
		url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
		userId: 'u1',
		createdAt: ago(8 * 60)
	},
	{
		code: 'abc143',
		url: 'https://docs.google.com/forms/d/e/1FAIp',
		userId: 'u2',
		createdAt: ago(60 * 24 * 60)
	},
	{
		code: 'abc473',
		url: 'https://www.chula.ac.th/about/',
		userId: 'u1',
		createdAt: ago(61 * 24 * 60)
	}
];

export const rules = {
	whitelist: ['https://docs.google.com/.*?', 'https://chula.ac.th/.*?', 'https://youtube.com/.*?'],
	blacklist: ['https://chula888.com/.*?', 'https://illegal.com/.*?']
};
