package com.peachsoft.peachagent.runtime.lease;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 验证过期时刻以及旧代次不能继续提交运行事实。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 15:05
 */
class LeaseFenceTest {

    private static final String NOW = "20261124070000";

    @Test
    void requiresMatchingOwnerAndEpochWithUnexpiredLease() {
        assertTrue(LeaseFence.isCurrent("worker", 2, "worker", 2, "20261124070001", NOW));
        assertFalse(LeaseFence.isCurrent("worker", 2, "worker", 2, NOW, NOW));
        assertFalse(LeaseFence.isCurrent("worker", 2, "worker", 2, "20261124065959", NOW));
        assertFalse(LeaseFence.isCurrent("worker", 1, "worker", 2, "20261124070001", NOW));
        assertFalse(LeaseFence.isCurrent("old", 2, "worker", 2, "20261124070001", NOW));
        assertFalse(LeaseFence.isCurrent("worker", 2, null, 2, null, NOW));
    }
}
