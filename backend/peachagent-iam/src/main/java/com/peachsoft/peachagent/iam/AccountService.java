package com.peachsoft.peachagent.iam;

import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.TimeCodec;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 账号创建、一次性邮箱验证、密码恢复和真实登录。 */
@Service
public class AccountService {
    private final JdbcTemplate jdbc;
    private final IdGenerator ids;
    private final DatabaseTimeProvider time;
    private final WorkspaceService workspaces;
    private final IdentityService identity;
    private final AccountRateLimiter limiter;
    private final AuditService audit;
    private final JavaMailSender mail;
    private final String from;
    private final Argon2PasswordEncoder passwords=Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    private final String dummyHash=passwords.encode(SecurityTokens.random());

    public record Challenge(String email,String purpose) { }
    public record Register(String email,String token,String password,String displayName,String currency) { }
    public record Login(String email,String password,boolean remember) { }
    public record Reset(String email,String token,String password) { }
    public record Preferences(String locale,String theme) { }

    public AccountService(JdbcTemplate jdbc,IdGenerator ids,DatabaseTimeProvider time,WorkspaceService workspaces,
                          IdentityService identity,AccountRateLimiter limiter,AuditService audit,JavaMailSender mail,
                          @Value("${peachagent.mail-from}") String from) {
        this.jdbc=jdbc;this.ids=ids;this.time=time;this.workspaces=workspaces;this.identity=identity;
        this.limiter=limiter;this.audit=audit;this.mail=mail;this.from=from;
    }

    private static String email(String value) {
        if (value==null || value.length()>254 || !value.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) {
            throw new DomainException("INVALID_EMAIL",422,"Invalid email");
        }
        return value.toLowerCase(Locale.ROOT);
    }

    private static void validatePassword(String value) {
        if (value==null || value.length()<12 || value.length()>128) {
            throw new DomainException("INVALID_PASSWORD",422,"Password must contain 12-128 characters");
        }
    }

    public void challenge(Challenge input,String remoteAddress) {
        String key=email(input.email()),purpose=input.purpose();
        if (!List.of("REGISTER","RESET").contains(purpose)) throw new DomainException("INVALID_PURPOSE",422,"Invalid challenge purpose");
        limiter.check("challenge-ip",remoteAddress,20,600);
        limiter.check("challenge-email",key,2,120);
        var users=jdbc.queryForList("SELECT ID FROM IAM_USER WHERE EMAIL_KEY = ? AND STATUS = 'ACTIVE'",String.class,key);
        if (("REGISTER".equals(purpose)&&!users.isEmpty())||("RESET".equals(purpose)&&users.isEmpty())) return;
        String token=SecurityTokens.random(),id=ids.nextId(),now=time.now();
        jdbc.update("""
                INSERT INTO IAM_EMAIL_CHALLENGE (ID,USER_ID,EMAIL_KEY,PURPOSE,TOKEN_HASH,EXPIRES_AT,ATTEMPT_COUNT,CREATED_AT)
                VALUES (?,?,?,?,?,?,0,?)
                """,id,users.isEmpty()?null:users.getFirst(),key,purpose,SecurityTokens.digest(token),TimeCodec.plusSeconds(now,900),now);
        SimpleMailMessage message=new SimpleMailMessage();
        message.setFrom(from);message.setTo(key);message.setSubject("PeachAgent verification");
        message.setText("Your one-time verification code (expires in 15 minutes):\n"+token+"\nDo not share this code.");
        try { mail.send(message); }
        catch (RuntimeException e) {
            jdbc.update("UPDATE IAM_EMAIL_CHALLENGE SET CONSUMED_AT = ? WHERE ID = ?",time.now(),id);
            // 同一响应避免泄露邮箱是否已注册，邮件故障通过监控和内部错误事件处理。
            audit.record(null,null,null,null,"EMAIL_DELIVERY","CHALLENGE",id,"FAILED","MAIL_UNAVAILABLE");
        }
    }

    @Transactional
    public void register(Register input,String remoteAddress) {
        String key=email(input.email());
        limiter.check("register-ip",remoteAddress,20,600);
        validatePassword(input.password());
        if (input.displayName()==null||input.displayName().isBlank()||input.displayName().strip().length()>80) {
            throw new DomainException("INVALID_NAME",422,"Invalid display name");
        }
        String currency=input.currency()==null?"USD":input.currency();
        if (!List.of("USD","CNY").contains(currency)) throw new DomainException("INVALID_CURRENCY",422,"Invalid currency");
        consume(key,"REGISTER",input.token(),null);
        String user=ids.nextId(),tenant=ids.nextId(),now=time.now();
        jdbc.update("""
                INSERT INTO IAM_USER (ID,EMAIL,EMAIL_KEY,PASSWORD_HASH,DISPLAY_NAME,PLATFORM_ROLE,STATUS,EMAIL_VERIFIED_AT,AUTH_EPOCH,LOCALE,THEME,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,'USER','ACTIVE',?,0,'zh-CN','editorial-light',?,?,?,?)
                """,user,key,key,passwords.encode(input.password()),input.displayName().strip(),now,now,user,now,user);
        jdbc.update("""
                INSERT INTO IAM_TENANT (ID,OWNER_USER_ID,TENANT_CODE,NAME,STATUS,CURRENCY,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,'ACTIVE',?,?,?,?,?)
                """,tenant,user,"T-"+tenant,input.displayName().strip(),currency,now,user,now,user);
        workspaces.initializeBudget(tenant,null,null,"TENANT",tenant,currency,8,user,now);
        String workspace=workspaces.initializeWorkspace(user,tenant,currency,"默认工作空间",null);
        jdbc.update("UPDATE IAM_TENANT SET DEFAULT_WORKSPACE_ID = ? WHERE ID = ?",workspace,tenant);
        audit.record(tenant,workspace,null,user,"REGISTER","USER",user,"SUCCESS",null);
    }

    public Map<String,Object> login(Login input,String remoteAddress) {
        String key=email(input.email());
        limiter.check("login-ip",remoteAddress,30,300);
        limiter.check("login-email",key,10,300);
        if (input.password()==null||input.password().length()>128) throw denied();
        var rows=jdbc.queryForList("SELECT ID,PASSWORD_HASH,STATUS FROM IAM_USER WHERE EMAIL_KEY = ?",key);
        String encoded=rows.isEmpty()?dummyHash:(String)rows.getFirst().get("PASSWORD_HASH");
        boolean matched=passwords.matches(input.password(),encoded);
        if (!matched||rows.isEmpty()||!"ACTIVE".equals(rows.getFirst().get("STATUS"))) {
            audit.record(null,null,null,null,"LOGIN","USER",null,"FAILED","INVALID_CREDENTIALS");
            throw denied();
        }
        var principal=identity.active((String)rows.getFirst().get("ID"));
        StpUtil.login(principal.userId(),new SaLoginParameter().setTimeout(input.remember()?604800:86400)
                .setIsLastingCookie(input.remember()));
        StpUtil.getTokenSession().set("authEpoch",Long.toString(principal.authEpoch()));
        StpUtil.getTokenSession().set("csrfToken",SecurityTokens.random());
        jdbc.update("UPDATE IAM_USER SET LAST_LOGIN_AT = ? WHERE ID = ?",time.now(),principal.userId());
        audit.record(principal.tenantId(),null,null,principal.userId(),"LOGIN","USER",principal.userId(),"SUCCESS",null);
        return identity.sessionView(principal);
    }

    @Transactional
    public void reset(Reset input,String remoteAddress) {
        String key=email(input.email());
        limiter.check("reset-ip",remoteAddress,20,600);
        limiter.check("reset-email",key,5,600);
        validatePassword(input.password());
        var users=jdbc.queryForList("SELECT ID FROM IAM_USER WHERE EMAIL_KEY = ? AND STATUS = 'ACTIVE' FOR UPDATE",String.class,key);
        if (users.isEmpty()) throw invalidChallenge();
        String user=users.getFirst();
        consume(key,"RESET",input.token(),user);
        jdbc.update("""
                UPDATE IAM_USER SET PASSWORD_HASH = ?,AUTH_EPOCH = AUTH_EPOCH + 1,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE ID = ?
                """,passwords.encode(input.password()),time.now(),user,user);
        jdbc.update("UPDATE IAM_EMAIL_CHALLENGE SET CONSUMED_AT = ? WHERE USER_ID = ? AND PURPOSE = 'RESET' AND CONSUMED_AT IS NULL",time.now(),user);
        var p=identity.active(user);
        audit.record(p.tenantId(),null,null,user,"PASSWORD_RESET","USER",user,"SUCCESS",null);
        // 所有既有 Session 在下一次授权检查时因 auth_epoch 不匹配被拒绝。
    }

    private void consume(String key,String purpose,String token,String user) {
        if (token==null||!token.matches("[A-Za-z0-9_-]{43}")) throw invalidChallenge();
        String now=time.now();
        int changed=jdbc.update("""
                UPDATE IAM_EMAIL_CHALLENGE SET CONSUMED_AT = ?
                WHERE EMAIL_KEY = ? AND PURPOSE = ? AND TOKEN_HASH = ? AND CONSUMED_AT IS NULL AND EXPIRES_AT > ?
                AND ((USER_ID IS NULL AND ? IS NULL) OR USER_ID = ?)
                """,now,key,purpose,SecurityTokens.digest(token),now,user,user);
        if (changed!=1) throw invalidChallenge();
    }

    public Map<String,Object> preferences(Preferences input) {
        var p=identity.current();
        if (!List.of("zh-CN","en-US").contains(input.locale())||
            !List.of("editorial-light","obsidian-dark","nordic-slate").contains(input.theme())) {
            throw new DomainException("INVALID_PREFERENCES",422,"Invalid locale or theme");
        }
        jdbc.update("UPDATE IAM_USER SET LOCALE = ?,THEME = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1 WHERE ID = ?",
                input.locale(),input.theme(),time.now(),p.userId(),p.userId());
        return identity.sessionView(identity.current());
    }

    public void logout() {
        var p=identity.current();
        audit.record(p.tenantId(),null,null,p.userId(),"LOGOUT","USER",p.userId(),"SUCCESS",null);
        StpUtil.logout();
    }

    private static DomainException invalidChallenge() {return new DomainException("INVALID_CHALLENGE",422,"Invalid or expired verification code");}
    private static DomainException denied() {return new DomainException("INVALID_CREDENTIALS",401,"Invalid email or password");}
}
