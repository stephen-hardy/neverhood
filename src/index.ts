export interface Env {
	ASSETS: R2Bucket;
	SAVES: KVNamespace;
}

const STATIC_FILES: Record<string, string> = {
	'/': 'index.html',
	'/index.html': 'index.html',
	'/engine_v2.js': 'engine_v2.js',
	'/scummvm.wasm': 'scummvm.wasm',
	'/sw.js': 'sw.js',
	'/worker.v1.js': 'worker.v1.js',
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// 1. Serve Static Files from R2
		const staticFile = STATIC_FILES[url.pathname];
		if (staticFile) {
			const object = await env.ASSETS.get(`static/${staticFile}`);
			if (object) {
				const headers = new Headers();
				object.writeHttpMetadata(headers);
				headers.set('etag', object.httpEtag);
				headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
				if (staticFile.endsWith('.js')) headers.set('Content-Type', 'application/javascript');
				if (staticFile.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm');
				if (staticFile.endsWith('.html')) headers.set('Content-Type', 'text/html');
				return new Response(object.body, { headers });
			}
		}

		// 2. Asset Delivery from R2 (Game Data)
		if (url.pathname.startsWith('/data/') && !url.pathname.endsWith('index.json')) {
			console.log("SCUMMVM REQUESTED:", url.pathname);
			const key = url.pathname.slice('/data/'.length).toLowerCase(); // 'a.blb'
			const object = await env.ASSETS.get(key, {
				range: request.headers,
				onlyIf: request.headers,
			});

			if (object === null) {
				return new Response('Object Not Found', { status: 404 });
			}

			const headers = new Headers();
			object.writeHttpMetadata(headers);
			headers.set('etag', object.httpEtag);
			headers.set('Accept-Ranges', 'bytes');
			headers.set('Access-Control-Allow-Origin', '*');
			headers.set('Access-Control-Expose-Headers', 'Content-Range');

			if (object.range) {
				const range = object.range as any;
				const start = range.offset;
				const end = range.offset + range.length - 1;
				headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
				headers.set('Content-Length', range.length.toString());
			} else {
				headers.set('Content-Length', object.size.toString());
			}
			
			headers.set('Cache-Control', 'public, max-age=31536000, immutable');

			return new Response(object.body, {
				headers,
				status: object.range ? 206 : 200,
			});
		}

		// 3. Save API
		if (url.pathname.startsWith('/api/saves/')) {
			const saveName = url.pathname.slice('/api/saves/'.length);
			if (request.method === 'PUT') {
				const body = await request.arrayBuffer();
				await env.SAVES.put(saveName, body);
				return new Response('Saved', { status: 201 });
			}
			if (request.method === 'GET') {
				if (saveName === '') {
					// List saves
					const list = await env.SAVES.list();
					return Response.json(list.keys.map(k => k.name));
				}
				const value = await env.SAVES.get(saveName, 'arrayBuffer');
				if (value === null) {
					return new Response('Not Found', { status: 404 });
				}
				return new Response(value, {
					headers: { 'Content-Type': 'application/octet-stream' },
				});
			}
		}

		if (url.pathname.endsWith('index.json')) {
			if (url.searchParams.has('dynamic')) {
				try {
					const list = await env.ASSETS.list();
					const files: Record<string, number> = {};
					for (const obj of list.objects) {
						files[obj.key] = obj.size;
					}
					return new Response(JSON.stringify({ files }));
				} catch(e: any) {
					return new Response(e.message);
				}
			}

			const files: Record<string, number> = {
				"A.BLB": 50571893,
				"C.BLB": 241856188,
				"HD.BLB": 4279716,
				"I.BLB": 42015045,
				"M.BLB": 53797472,
				"S.BLB": 16622792,
				"T.BLB": 228979468,
				"a.blb": 50571893,
				"c.blb": 241856188,
				"hd.blb": 4279716,
				"i.blb": 42015045,
				"m.blb": 53797472,
				"s.blb": 16622792,
				"t.blb": 228979468,
				"neverhood.dat": 23804,
			};

			return new Response(JSON.stringify(files), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } });
		}

		console.log("FALLBACK HIT FOR URL:", url.pathname);
		return new Response('FALLBACK_TEXT_HERE', { status: 404, headers: { 'Cache-Control': 'no-cache' } });
	},
};
