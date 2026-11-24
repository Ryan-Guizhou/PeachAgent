package com.peachsoft.peachagent.runtime;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 终态流必须交付同一状态快照的全部事件后才结束。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 17:48
 */
class EventPageTest {

    @Test
    void terminalStreamClosesOnlyAtCommittedHighWaterMark() {
        assertFalse(new RunService.EventPage(List.of(), false, 5).drained(5));
        assertFalse(new RunService.EventPage(List.of(), true, 6).drained(5));
        assertTrue(new RunService.EventPage(List.of(), true, 6).drained(6));
    }
}
