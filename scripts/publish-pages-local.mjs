// Build on this PC, then let GitHub's standard Pages deployment publish static files.
import {spawnSync} from 'node:child_process';
import {cp,mkdir,mkdtemp,writeFile,lstat,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),dry=args.includes('--dry-run');
const usage='npm run publish:pages -- --repo OWNER/REPOSITORY [--dry-run]';
if(args.includes('--help')){console.log(usage);process.exit(0);}
const index=args.indexOf('--repo'),repo=index>=0?args[index+1]:undefined;
const remaining=args.filter((_,i)=>i!==index&&i!==index+1&&args[i]!=='--dry-run');
if(!repo||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)||remaining.length){console.error(usage);process.exit(1);}

function run(command,parameters,{cwd=root,capture=false,input,allowFailure=false}={}){
 const result=spawnSync(command,parameters,{cwd,encoding:'utf8',input,stdio:capture?['pipe','pipe','pipe']:['pipe','inherit','inherit'],windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0&&!allowFailure)throw Error(`${command} ${parameters.join(' ')} failed (${result.status}).${capture?'\n'+result.stderr:''}`);
 return result;
}
const git=(...parameters)=>run('git',parameters,{capture:true}).stdout.trim();
async function regularFiles(directory){
 const found=[];
 for(const name of await readdir(directory)){
  const path=resolve(directory,name),info=await lstat(path);
  if(info.isSymbolicLink())throw Error(`Deployment output contains a symbolic link: ${name}`);
  if(info.isDirectory())found.push(...await regularFiles(path));
  else if(info.isFile())found.push(path);
 }
 return found;
}

try{
 if(git('status','--porcelain'))throw Error('Commit source changes before publishing; the working tree must be clean.');
 const commit=git('rev-parse','HEAD'),remote=`https://github.com/${repo}.git`;
 if(!dry){
  const target=JSON.parse(run('gh',['api',`repos/${repo}`],{capture:true}).stdout);
  if(target.private||target.visibility!=='public')throw Error('This command only publishes an existing public repository.');
  if(target.default_branch!=='main')throw Error('Expected main as the source branch; refusing to change another repository layout.');
  if(!target.permissions?.push)throw Error('The authenticated account cannot push to the target repository.');
 }
 const npm=process.env.npm_execpath||resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
 if(!existsSync(npm))throw Error('Cannot find npm. Run this command through npm run publish:pages.');
 for(const parameters of [['run','check'],['test'],['run','build']])run(process.execPath,[npm,...parameters]);
 run(process.execPath,['tests/static-output.mjs']);
 if(git('rev-parse','HEAD')!==commit||git('status','--porcelain'))throw Error('Source changed during verification. Commit it and start again.');
 const output=resolve(root,'dist-pages'),files=await regularFiles(output);
 if(!files.length||!existsSync(resolve(output,'index.html')))throw Error('Static build is missing index.html.');
 await mkdir(resolve(root,'work'),{recursive:true});
 const stage=await mkdtemp(resolve(root,'work/pages-publish-'));
 await cp(output,stage,{recursive:true});
 await writeFile(resolve(stage,'.nojekyll'),'');
 await writeFile(resolve(stage,'release.json'),JSON.stringify({app:'wotagei-master',sourceCommit:commit,sourceRepository:`https://github.com/${repo}`,method:'prebuilt-static-branch'},null,2)+'\n');
 if(dry){console.log(JSON.stringify({dryRun:true,repository:repo,sourceCommit:commit,stage,files:files.length+2}));process.exit(0);}

 // No force-push: changed remote history or a concurrent update stops publication.
 run('git',['push',remote,`${commit}:refs/heads/main`]);
 const stageGit=(...parameters)=>run('git',parameters,{cwd:stage,capture:true});
 stageGit('init','--initial-branch=gh-pages');
 stageGit('config','core.autocrlf','false');
 for(const [key,format] of [['user.name','%an'],['user.email','%ae']]){
  const configured=run('git',['config',key],{capture:true,allowFailure:true}).stdout.trim();
  stageGit('config',key,configured||git('log','-1',`--format=${format}`));
 }
 stageGit('remote','add','origin',remote);
 const branch=run('git',['ls-remote','--exit-code','--heads',remote,'gh-pages'],{capture:true,allowFailure:true});
 if(branch.status===0){stageGit('fetch','--depth=1','origin','gh-pages');stageGit('reset','--mixed','FETCH_HEAD');}
 else if(branch.status!==2)throw Error(`Cannot inspect the existing publication branch: ${branch.stderr}`);
 stageGit('add','--all');
 if(stageGit('status','--porcelain').stdout.trim())stageGit('commit','-m',`Publish verified static build ${commit.slice(0,12)}`);
 stageGit('push','origin','HEAD:refs/heads/gh-pages');

 const endpoint=`repos/${repo}/pages`;
 let configurationChanged=false;
 let current=run('gh',['api',endpoint],{capture:true,allowFailure:true});
 const desired={build_type:'legacy',source:{branch:'gh-pages',path:'/'}};
 if(current.status!==0){
  if(!/404/.test(current.stderr+current.stdout))throw Error(`Cannot read Pages configuration: ${current.stderr}`);
  configurationChanged=true;
  const created=run('gh',['api','--method','POST',endpoint,'--input','-'],{capture:true,input:JSON.stringify(desired),allowFailure:true});
  if(created.status!==0&&!/409/.test(created.stderr+created.stdout))throw Error(`Cannot enable Pages: ${created.stderr}`);
  current=run('gh',['api',endpoint],{capture:true});
 }
 let pages=JSON.parse(current.stdout);
 if(pages.build_type!=='legacy'||pages.source?.branch!=='gh-pages'||pages.source?.path!=='/'){
  run('gh',['api','--method','PUT',endpoint,'--input','-'],{capture:true,input:JSON.stringify(desired)});
  configurationChanged=true;
  pages=JSON.parse(run('gh',['api',endpoint],{capture:true}).stdout);
 }
 if(configurationChanged)run('gh',['api','--method','POST',`${endpoint}/builds`],{capture:true});
 console.log(JSON.stringify({repository:repo,sourceCommit:commit,publishedBranch:stageGit('rev-parse','HEAD').stdout.trim(),stage,url:pages.html_url,status:'pushed; verify pages-build-deployment and the live release.json before reporting success'}));
}catch(error){console.error(error.message);process.exitCode=1;}
