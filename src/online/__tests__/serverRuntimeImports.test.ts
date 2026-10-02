import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Vercel server ESM runtime',()=>{
  it.each(['start','action','pump'])('%s endpoint uses explicit Node ESM specifiers',(name)=>{
    const source=readFileSync(join(process.cwd(),`api/online/match/${name}.ts`),'utf8');
    expect(source).not.toMatch(/from\s+['"]\.{1,2}\/[^'"]*(?<!\.js)['"]/);
  });
  it('runs a compiled transitive import and entrypoint smoke gate in the build pipeline',()=>{
    const pkg=JSON.parse(readFileSync(join(process.cwd(),'package.json'),'utf8')) as {scripts:Record<string,string>};
    expect(pkg.scripts['typecheck:api']).toContain('tsconfig.api.json');
    expect(pkg.scripts.build).toContain('check:api-runtime');
  });
});
