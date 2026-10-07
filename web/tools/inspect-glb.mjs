// Lists node names, mesh/material counts and triangle totals of a glb. Resolves gltf-transform through the CLI package (pnpm layout).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
const req = createRequire(realpathSync(new URL('../node_modules/@gltf-transform/cli/package.json', import.meta.url)));
const core = await import(pathToFileURL(req.resolve('@gltf-transform/core')));
const ext = await import(pathToFileURL(req.resolve('@gltf-transform/extensions')));
const draco3d = (await import(pathToFileURL(req.resolve('draco3dgltf')))).default;
const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  const nodes = root.listNodes();
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  const want = ['Block','HeadL','HeadR','Crank',...Array.from({length:8},(_,i)=>`Cyl_${i+1}_Piston`),...Array.from({length:8},(_,i)=>`PistonHolder_${i+1}`)];
  const names = new Set(nodes.map(n=>n.getName()));
  console.log(f, '| nodes', nodes.length, '| meshes', root.listMeshes().length, '| materials', root.listMaterials().length, '| tris', Math.round(tris));
  console.log('  missing contract nodes:', want.filter(w=>!names.has(w)));
  const p1 = nodes.find(n=>n.getName()==='Cyl_1_Piston'); const h1 = nodes.find(n=>n.getName()==='PistonHolder_1');
  console.log('  piston1 local t', p1?.getTranslation(), 'holder1 t', h1?.getTranslation(), 'holder parent', h1?.getParentNode()?.getName());
  const crank = nodes.find(n=>n.getName()==='Crank'); console.log('  crank t', crank?.getTranslation(), 'r', crank?.getRotation());
  const sr = nodes.find(n=>n.getName().startsWith('GLTF_SceneRootNode')); console.log('  scene root children', sr?.listChildren().length);
}
// extras check: how many scene-root children carry an `explode` offset
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const nodes = doc.getRoot().listNodes();
  const sr = nodes.find(n=>n.getName().startsWith('GLTF_SceneRootNode'));
  const kids = sr?.listChildren() ?? [];
  const withExplode = kids.filter(k => Array.isArray(k.getExtras()?.explode));
  console.log(f, '| scene-root children', kids.length, '| with explode extras', withExplode.length, '| sample', withExplode[0]?.getName(), withExplode[0]?.getExtras()?.explode);
}
