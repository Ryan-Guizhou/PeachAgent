package com.peachsoft.peachagent.common;

/** 领域异常只暴露稳定错误码与可安全返回的描述。 */
public final class DomainException extends RuntimeException {
    private final String code;
    private final int status;

    public DomainException(String code, int status, String message) {
        super(message);
        this.code = code;
        this.status = status;
    }

    public String code() { return code; }
    public int status() { return status; }
}
