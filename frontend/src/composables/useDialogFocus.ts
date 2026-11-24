import { nextTick, ref, watch, type Ref } from 'vue'

/** 对话框的焦点进入、循环和关闭后恢复。 */
export function useDialogFocus(open:Ref<string>, onClose:()=>void){
  const dialogRef=ref<HTMLFormElement|null>(null)
  let trigger:HTMLElement|null=null
  function rememberFocus(){
    trigger=document.activeElement instanceof HTMLElement?document.activeElement:null
  }
  function controls(){
    return Array.from(dialogRef.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]'
    )||[]).filter(el=>el.getClientRects().length>0)
  }
  watch(open,async(value,previous)=>{
    await nextTick()
    if(value&&open.value===value){
      (controls().find(el=>el.matches('input,textarea,select'))||controls()[0]||dialogRef.value)?.focus()
    }else if(!value&&previous&&!open.value){
      if(trigger?.isConnected)trigger.focus()
      trigger=null
    }
  },{flush:'post'})
  function handleDialogKey(event:KeyboardEvent){
    if(event.key==='Escape'){event.preventDefault();onClose();return}
    if(event.key!=='Tab')return
    const items=controls()
    if(!items.length){event.preventDefault();dialogRef.value?.focus();return}
    const first=items[0],last=items[items.length-1]
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  return {dialogRef,rememberFocus,handleDialogKey}
}
