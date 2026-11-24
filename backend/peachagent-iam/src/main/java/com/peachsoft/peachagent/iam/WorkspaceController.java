package com.peachsoft.peachagent.iam;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 工作空间和项目的资源接口，所有操作通过服务端身份范围授权。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:29
 */
@RestController
@RequestMapping("/api/v1/workspaces")
@Profile("api")
public class WorkspaceController {
    private final WorkspaceService workspaces;

    public WorkspaceController(WorkspaceService workspaces) {
        this.workspaces = workspaces;
    }
    /**
     * 用于归档和恢复的乐观锁版本。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:29
     */
    public record Revision(long rowVersion) {}

    @GetMapping
    public List<WorkspaceService.Workspace> list(
            @RequestParam(required = false) String afterTime,
            @RequestParam(required = false) String afterId,
            @RequestParam(defaultValue = "50") int limit) {
        return workspaces.listWorkspaces(afterTime, afterId, limit);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceService.Workspace create(@RequestBody WorkspaceService.Create input) {
        return workspaces.createWorkspace(input);
    }

    @GetMapping("/{workspaceId}")
    public WorkspaceService.Workspace get(@PathVariable String workspaceId) {
        return workspaces.workspace(workspaceId);
    }

    @PatchMapping("/{workspaceId}")
    public WorkspaceService.Workspace update(
            @PathVariable String workspaceId, @RequestBody WorkspaceService.Update input) {
        return workspaces.updateWorkspace(workspaceId, input);
    }

    @PostMapping("/{workspaceId}/archive")
    public WorkspaceService.Workspace archive(@PathVariable String workspaceId, @RequestBody Revision input) {
        return workspaces.changeWorkspace(workspaceId, true, input.rowVersion());
    }

    @PostMapping("/{workspaceId}/restore")
    public WorkspaceService.Workspace restore(@PathVariable String workspaceId, @RequestBody Revision input) {
        return workspaces.changeWorkspace(workspaceId, false, input.rowVersion());
    }

    @GetMapping("/{workspaceId}/projects")
    public List<WorkspaceService.Project> projects(
            @PathVariable String workspaceId,
            @RequestParam(required = false) String afterTime,
            @RequestParam(required = false) String afterId,
            @RequestParam(defaultValue = "50") int limit) {
        return workspaces.listProjects(workspaceId, afterTime, afterId, limit);
    }

    @PostMapping("/{workspaceId}/projects")
    @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceService.Project createProject(
            @PathVariable String workspaceId, @RequestBody WorkspaceService.Create input) {
        return workspaces.createProject(workspaceId, input);
    }

    @GetMapping("/{workspaceId}/projects/{projectId}")
    public WorkspaceService.Project project(@PathVariable String workspaceId, @PathVariable String projectId) {
        return workspaces.project(workspaceId, projectId);
    }

    @PatchMapping("/{workspaceId}/projects/{projectId}")
    public WorkspaceService.Project updateProject(
            @PathVariable String workspaceId,
            @PathVariable String projectId,
            @RequestBody WorkspaceService.Update input) {
        return workspaces.updateProject(workspaceId, projectId, input);
    }

    @PostMapping("/{workspaceId}/projects/{projectId}/archive")
    public WorkspaceService.Project archiveProject(
            @PathVariable String workspaceId, @PathVariable String projectId, @RequestBody Revision input) {
        return workspaces.changeProject(workspaceId, projectId, true, input.rowVersion());
    }

    @PostMapping("/{workspaceId}/projects/{projectId}/restore")
    public WorkspaceService.Project restoreProject(
            @PathVariable String workspaceId, @PathVariable String projectId, @RequestBody Revision input) {
        return workspaces.changeProject(workspaceId, projectId, false, input.rowVersion());
    }
}
