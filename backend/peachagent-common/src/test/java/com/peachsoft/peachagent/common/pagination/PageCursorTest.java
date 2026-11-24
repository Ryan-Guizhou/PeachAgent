package com.peachsoft.peachagent.common.pagination;

import com.peachsoft.peachagent.common.DomainException;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 验证复合游标格式以及时间与 ID 的绑定关系。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 17:48
 */
class PageCursorTest {

    @Test
    void validatesCursorPair() {
        assertFalse(PageCursor.of(null, null).hasTieBreaker());
        assertFalse(PageCursor.of("20261124000000", null).hasTieBreaker());
        PageCursor cursor = PageCursor.of("20261124000000", "01234567-89AB-CDEF-0123-456789ABCDEF");
        assertTrue(cursor.hasTieBreaker());
        assertEquals("01234567-89ab-cdef-0123-456789abcdef", cursor.id());
        assertThrows(DomainException.class, () -> PageCursor.of(null, "01234567-89ab-cdef-0123-456789abcdef"));
        assertThrows(DomainException.class, () -> PageCursor.of("20261124000000", "invalid"));
        assertThrows(DomainException.class, () -> PageCursor.of("20260230000000", null));
    }
}
