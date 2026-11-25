package com.peachsoft.peachagent.iam;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;

import cn.dev33.satoken.exception.NotLoginException;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/**
 * 统一安全错误响应，避免 SQL、密码、请求正文及供应商原始错误泄漏。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:29
 */
@RestControllerAdvice
@Profile("api")
public class IamErrors {
    private static final Logger LOG = LoggerFactory.getLogger(IamErrors.class);
    private final IdGenerator ids;

    public IamErrors(IdGenerator ids) {
        this.ids = ids;
    }

    private ResponseEntity<Map<String, String>> result(int status, String code, String message) {
        return ResponseEntity.status(status)
                .body(Map.of(
                        "code",
                        code,
                        "message",
                        message,
                        "traceId",
                        ids.nextId().replace("-", "")));
    }

    @ExceptionHandler(DomainException.class)
    public ResponseEntity<Map<String, String>> domain(DomainException error) {
        return result(error.status(), error.code(), error.getMessage());
    }

    @ExceptionHandler(NotLoginException.class)
    public ResponseEntity<Map<String, String>> unauthenticated() {
        return result(401, "SESSION_EXPIRED", "Sign in required");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> conflict() {
        return result(409, "DATA_CONFLICT", "Resource conflicts with existing data");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> badRequest() {
        return result(400, "INVALID_REQUEST", "Invalid request body");
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> status(ResponseStatusException e) {
        return result(e.getStatusCode().value(), "REQUEST_FAILED", "Request failed");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> unexpected(Exception error) {
        String trace = ids.nextId().replace("-", "");
        LOG.error(
                "Unhandled request error traceId={} type={}",
                trace,
                error.getClass().getSimpleName());
        return ResponseEntity.internalServerError()
                .body(Map.of("code", "INTERNAL_ERROR", "message", "Request failed", "traceId", trace));
    }
}
