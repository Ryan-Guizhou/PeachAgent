package com.peachsoft.peachagent.common;

/**
 * 统一业务主键发号接口。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:27
 */
@FunctionalInterface
public interface IdGenerator {
    String nextId();
}
