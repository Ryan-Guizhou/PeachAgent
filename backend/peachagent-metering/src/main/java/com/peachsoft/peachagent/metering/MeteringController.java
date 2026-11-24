package com.peachsoft.peachagent.metering;

import com.peachsoft.peachagent.iam.IdentityService;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;

@RestController
@Profile("api")
@RequestMapping("/api/v1/workspaces/{w}/projects/{p}")
public class MeteringController {
    private final IdentityService identity;
    private final BudgetService budgets;
    public MeteringController(IdentityService identity,BudgetService budgets){this.identity=identity;this.budgets=budgets;}
    @GetMapping("/budgets")
    public List<Map<String,Object>> budgets(@PathVariable String w,@PathVariable String p){return budgets.list(identity.project(w,p));}
    @PatchMapping("/budgets/{id}")
    public void change(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestBody BudgetService.Limits input){
        budgets.change(identity.project(w,p),id,input);
    }
    @GetMapping("/budgets/overview")
    public List<Map<String,Object>> overview(@PathVariable String w,@PathVariable String p){
        return budgets.overview(identity.project(w,p));
    }
    @GetMapping("/usage/summary")
    public List<Map<String,Object>> summary(@PathVariable String w,@PathVariable String p,
                                            @RequestParam String from,@RequestParam String to){
        return budgets.summary(identity.project(w,p),from,to);
    }
    @GetMapping("/usage")
    public List<Map<String,Object>> usage(@PathVariable String w,@PathVariable String p,@RequestParam String from,@RequestParam String to,
                                           @RequestParam(defaultValue="100") int limit){
        return budgets.usage(identity.project(w,p),from,to,limit);
    }
}
