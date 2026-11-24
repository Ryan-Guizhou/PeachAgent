package com.peachsoft.peachagent.common.pagination;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.TimeCodec;
import java.time.DateTimeException;
import java.util.Locale;
import java.util.regex.Pattern;

/** 使用 UTC 时间与 UUID 作为稳定的降序键集游标。 */
public record PageCursor(String time, String id) {

    private static final Pattern UUID_PATTERN = Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

    /** 时间允许作为独立范围上界；使用 ID 时必须同时提供时间。 */
    public static PageCursor of(String time, String id) {
        if (time != null) {
            try {
                TimeCodec.parse(time);
            } catch (DateTimeException | IllegalArgumentException ex) {
                throw new DomainException("INVALID_CURSOR", 422, "Invalid pagination cursor time");
            }
        }
        if (id != null && (time == null || !UUID_PATTERN.matcher(id).matches())) {
            throw new DomainException("INVALID_CURSOR", 422, "Invalid pagination cursor");
        }
        return new PageCursor(time, id == null ? null : id.toLowerCase(Locale.ROOT));
    }

    /** 是否采用时间与 ID 的严格复合边界。 */
    public boolean hasTieBreaker() {
        return id != null;
    }
}
