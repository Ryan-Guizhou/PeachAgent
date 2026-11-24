import { defineStore } from 'pinia'
export type Row = Record<string, any>
export class ApiError extends Error { constructor(public status:number, public code:string, message:string){super(message)} }
export const useSession=defineStore('session',{
  state:()=>({ user:null as Row|null, workspaces:[] as Row[], projects:[] as Row[], workspaceId:'',projectId:'',locale:'zh-CN',theme:'editorial-light' }),
  getters:{w:s=>'/workspaces/'+encodeURIComponent(s.workspaceId),p:s=>'/workspaces/'+encodeURIComponent(s.workspaceId)+'/projects/'+encodeURIComponent(s.projectId)},
  actions:{
    async request<T=any>(path:string,method='GET',body?:unknown,key?:string):Promise<T>{
      const headers:Record<string,string>={'Accept':'application/json'}
      if(body!==undefined)headers['Content-Type']='application/json'
      if(this.user?.csrfToken&&method!=='GET')headers['X-CSRF-Token']=this.user.csrfToken
      if(key)headers['Idempotency-Key']=key
      const res=await fetch('/api/v1'+path,{method,credentials:'same-origin',headers,body:body===undefined?undefined:JSON.stringify(body)})
      const txt=await res.text()
      if(!res.ok){let data:Row={};try{data=JSON.parse(txt)}catch{};if(res.status===401)this.clear();throw new ApiError(res.status,data.code||'HTTP_'+res.status,data.message||res.statusText)}
      return (txt?JSON.parse(txt):undefined) as T
    },
    async boot(){this.user=await this.request('/auth/me');this.locale=this.user!.locale;this.theme=this.user!.theme;await this.loadSpaces(this.user!.defaultWorkspaceId)},
    async loadSpaces(selected?:string){this.workspaces=await this.request('/workspaces');const w=this.workspaces.find(x=>x.id===selected&&x.status==='ACTIVE')||this.workspaces.find(x=>x.status==='ACTIVE');this.workspaceId=w?.id||'';await this.loadProjects(w?.defaultProjectId)},
    async loadProjects(selected?:string){this.projects=this.workspaceId?await this.request(this.w+'/projects'):[];this.projectId=(this.projects.find(x=>x.id===selected&&x.status==='ACTIVE')||this.projects.find(x=>x.status==='ACTIVE'))?.id||''},
    async login(email:string,password:string,remember:boolean){await this.request('/auth/login','POST',{email,password,remember});await this.boot()},
    async preferences(locale:string,theme:string){await this.request('/auth/preferences','PATCH',{locale,theme});this.locale=locale;this.theme=theme},
    clear(){this.user=null;this.workspaces=[];this.projects=[];this.workspaceId='';this.projectId=''}
  }
})
export function requestKey(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')}
export function utcString(date:Date){return date.toISOString().slice(0,19).replace(/\D/g,'')}
export function localTime(s:unknown){if(typeof s!=='string'||!/^\d{14}$/.test(s))return s||'—';return new Date(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T'+s.slice(8,10)+':'+s.slice(10,12)+':'+s.slice(12,14)+'Z').toLocaleString()}
