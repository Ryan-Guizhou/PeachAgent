package com.peachsoft.peachagent.iam;

import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/workspaces")
@Profile("api")
public class WorkspaceController {
    private final WorkspaceService workspaces;
    public WorkspaceController(WorkspaceService workspaces) {this.workspaces=workspaces;}
    public record Revision(long rowVersion) { }

    @GetMapping
    public List<WorkspaceService.Workspace> list(@RequestParam(required=false) String afterTime,
            @RequestParam(required=false) String afterId,@RequestParam(defaultValue="50") int limit) {
        return workspaces.listWorkspaces(afterTime,afterId,limit);
    }
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceService.Workspace create(@RequestBody WorkspaceService.Create input) {return workspaces.createWorkspace(input);}
    @GetMapping("/{workspaceId}")
    public WorkspaceService.Workspace get(@PathVariable String workspaceId) {return workspaces.workspace(workspaceId);}
    @PatchMapping("/{workspaceId}")
    public WorkspaceService.Workspace update(@PathVariable String workspaceId,@RequestBody WorkspaceService.Update input) {return workspaces.updateWorkspace(workspaceId,input);}
    @PostMapping("/{workspaceId}/archive")
    public WorkspaceService.Workspace archive(@PathVariable String workspaceId,@RequestBody Revision input) {return workspaces.changeWorkspace(workspaceId,true,input.rowVersion());}
    @PostMapping("/{workspaceId}/restore")
    public WorkspaceService.Workspace restore(@PathVariable String workspaceId,@RequestBody Revision input) {return workspaces.changeWorkspace(workspaceId,false,input.rowVersion());}
    @GetMapping("/{workspaceId}/projects")
    public List<WorkspaceService.Project> projects(@PathVariable String workspaceId,@RequestParam(required=false) String afterTime,
            @RequestParam(required=false) String afterId,@RequestParam(defaultValue="50") int limit) {
        return workspaces.listProjects(workspaceId,afterTime,afterId,limit);
    }
    @PostMapping("/{workspaceId}/projects")
    @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceService.Project createProject(@PathVariable String workspaceId,@RequestBody WorkspaceService.Create input) {return workspaces.createProject(workspaceId,input);}
    @GetMapping("/{workspaceId}/projects/{projectId}")
    public WorkspaceService.Project project(@PathVariable String workspaceId,@PathVariable String projectId) {return workspaces.project(workspaceId,projectId);}
    @PatchMapping("/{workspaceId}/projects/{projectId}")
    public WorkspaceService.Project updateProject(@PathVariable String workspaceId,@PathVariable String projectId,@RequestBody WorkspaceService.Update input) {return workspaces.updateProject(workspaceId,projectId,input);}
    @PostMapping("/{workspaceId}/projects/{projectId}/archive")
    public WorkspaceService.Project archiveProject(@PathVariable String workspaceId,@PathVariable String projectId,@RequestBody Revision input) {return workspaces.changeProject(workspaceId,projectId,true,input.rowVersion());}
    @PostMapping("/{workspaceId}/projects/{projectId}/restore")
    public WorkspaceService.Project restoreProject(@PathVariable String workspaceId,@PathVariable String projectId,@RequestBody Revision input) {return workspaces.changeProject(workspaceId,projectId,false,input.rowVersion());}
}
