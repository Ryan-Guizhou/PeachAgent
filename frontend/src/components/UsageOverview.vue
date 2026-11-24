<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useSession, utcString, localTime, type Row } from '../api'

const props=defineProps<{scope:string,revision:number,locale:string}>()
const session=useSession()
const overview=ref<Row[]>([])
const summary=ref<Row[]>([])
const error=ref('')
const loading=ref(false)
let generation=0
const tr=(zh:string,en:string)=>props.locale==='en-US'?en:zh
const display=(value:unknown)=>value===null||value===undefined?tr('未知','Unknown'):String(value)
const remaining=(value:unknown,limit:unknown)=>limit===null||limit===undefined?tr('无限额','No cap'):display(value)
const scopeLabel=(type:string)=>({TENANT:tr('租户','Tenant'),WORKSPACE:tr('工作空间','Workspace'),PROJECT:tr('项目','Project')}[type]||type)
async function load(){
  const request=++generation,scope=props.scope
  overview.value=[];summary.value=[];error.value=''
  if(!session.workspaceId||!session.projectId){loading.value=false;return}
  loading.value=true
  const from=utcString(new Date(Date.now()-30*86400000)),to=utcString(new Date(Date.now()+86400000))
  try{
    const results=await Promise.all([
      session.request<Row[]>(scope+'/budgets/overview'),
      session.request<Row[]>(scope+'/usage/summary?from='+from+'&to='+to)
    ])
    if(request===generation&&props.scope===scope){[overview.value,summary.value]=results}
  }catch(e){if(request===generation)error.value=e instanceof Error?e.message:String(e)}
  finally{if(request===generation)loading.value=false}
}
watch(()=>[props.scope,props.revision],()=>{void load()},{immediate:true})
onBeforeUnmount(()=>{generation++})
</script>

<template>
  <section class="panel" aria-labelledby="budget-overview-title">
    <h2 id="budget-overview-title">{{tr('当前周期预算占用','Current period budget usage')}}</h2>
    <p v-if="loading" role="status">{{tr('加载中','Loading')}}</p>
    <p v-if="error" class="error" role="alert">{{error}}</p>
    <p v-if="!loading&&!error&&!overview.length" class="empty">{{tr('尚无预算数据','No budget data')}}</p>
    <div v-for="b in overview" :key="b.id" class="budget-block">
      <h3>{{scopeLabel(b.scopeType)}} · {{localTime(b.periodStart)}} — {{localTime(b.periodEnd)}}</h3>
      <p class="muted">{{tr('未知调用','Unknown calls')}} {{b.unknownCalls}} · {{tr('并发','Concurrency')}} {{b.inflightCount}} / {{b.maxConcurrency}}</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>{{tr('资源','Resource')}}</th><th>{{tr('已用','Consumed')}}</th><th>{{tr('预占','Reserved')}}</th><th>{{tr('剩余','Remaining')}}</th><th>{{tr('限额','Limit')}}</th></tr></thead>
          <tbody>
            <tr><th>{{tr('调用次数','Calls')}}</th><td>{{b.consumedCalls}}</td><td>{{b.reservedCalls}}</td><td>{{remaining(b.remainingCalls,b.maxCalls)}}</td><td>{{b.maxCalls??tr('无限额','No cap')}}</td></tr>
            <tr><th>Token</th><td>{{b.consumedTokens}}</td><td>{{b.reservedTokens}}</td><td>{{remaining(b.remainingTokens,b.maxTokens)}}</td><td>{{b.maxTokens??tr('无限额','No cap')}}</td></tr>
            <tr><th>{{tr('金额','Cost')}} ({{b.currency}})</th><td>{{b.consumedCost}}</td><td>{{b.reservedCost}}</td><td>{{remaining(b.remainingCost,b.maxCost)}}</td><td>{{b.maxCost??tr('无限额','No cap')}}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <p class="muted">{{tr('未知消耗仍保留；存在不确定调用时不宣称可用 Token 或金额额度。','Uncertain consumption is retained; token and cost availability is not asserted when calls are uncertain.')}}</p>
  </section>
  <section class="panel" aria-labelledby="usage-summary-title">
    <h2 id="usage-summary-title">{{tr('近 30 天真实用量汇总','Last 30 days usage summary')}}</h2>
    <p class="muted">{{tr('独立于明细分页，按模型类型及用量/费用来源汇总。','Grouped by model type and usage/cost source, independent of call-detail pagination.')}}</p>
    <p v-if="!loading&&!error&&!summary.length" class="empty">{{tr('暂无已派发调用','No dispatched calls')}}</p>
    <div v-if="summary.length" class="table-wrap">
      <table>
        <thead><tr><th>{{tr('类型','Type')}}</th><th>{{tr('调用','Calls')}}</th><th>Token</th><th>{{tr('费用','Cost')}}</th><th>{{tr('来源','Sources')}}</th></tr></thead>
        <tbody><tr v-for="(row,index) in summary" :key="index">
          <td>{{row.modelType}}</td><td>{{row.callCount}}</td>
          <td>{{display(row.totalTokens)}}<small>{{tr('未知调用','Unknown calls')}} {{row.unknownTokenCalls}}</small></td>
          <td>{{display(row.costAmount)}} {{row.costCurrency}}<small>{{tr('未知调用','Unknown calls')}} {{row.unknownCostCalls}}</small></td>
          <td>{{row.usageSource}} / {{row.costSource}}</td>
        </tr></tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.budget-block{margin:16px 0;padding-bottom:12px;border-bottom:1px solid var(--border-subtle)}
.budget-block h3{font-size:14px;margin-bottom:6px}
</style>
