package com.peachsoft.peachagent.runtime.lease;

/** Worker 持久租约的 fencing 判定。时间值均使用数据库 UTC yyyyMMddHHmmss。 */
public final class LeaseFence {

    private LeaseFence() {
    }

    /**
     * 校验租约持有者、代次及严格过期边界。
     *
     * @param expectedOwner 当前执行者
     * @param expectedEpoch 当前执行代次
     * @param owner 数据库记录的执行者
     * @param epoch 数据库记录的执行代次
     * @param expiresAt 数据库记录的过期时间
     * @param now 当前数据库时间
     * @return 当前执行者仍可变更运行事实时返回 true
     */
    public static boolean isCurrent(String expectedOwner, long expectedEpoch, String owner,
                                    long epoch, String expiresAt, String now) {
        return expectedOwner != null && expectedOwner.equals(owner)
                && expectedEpoch == epoch && expiresAt != null && now != null
                && expiresAt.compareTo(now) > 0;
    }
}
