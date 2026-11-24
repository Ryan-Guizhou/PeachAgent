package com.peachsoft.peachagent.common;

/** 统一业务主键发号接口。 */
@FunctionalInterface
public interface IdGenerator {
    String nextId();
}
