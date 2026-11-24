package com.peachsoft.peachagent.metering;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 预算周期以 UTC 自然日/月计算，包含跨月、跨年和闰日。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 15:20
 */
class BudgetPeriodTest {

    @Test
    void monthRolloverUsesUtcBoundaries() {
        assertEquals(
                new BudgetService.Period("20261201000000", "20270101000000"),
                BudgetService.period("20261231235959", "MONTH"));
        assertEquals(
                new BudgetService.Period("20240201000000", "20240301000000"),
                BudgetService.period("20240229235959", "MONTH"));
    }

    @Test
    void dayRolloverHandlesLeapDay() {
        assertEquals(
                new BudgetService.Period("20240229000000", "20240301000000"),
                BudgetService.period("20240229235959", "DAY"));
    }
}
