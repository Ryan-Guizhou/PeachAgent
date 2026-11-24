package com.peachsoft.peachagent.iam;

import cn.dev33.satoken.stp.StpUtil;
import com.peachsoft.peachagent.common.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 所有业务 API 默认登录，写请求校验同源与当前 Token-Session CSRF。 */
@Configuration
@Profile("api")
public class IamWebConfiguration implements WebMvcConfigurer {
    private static final Set<String> PUBLIC_POSTS=Set.of("/api/v1/auth/email-challenges",
            "/api/v1/auth/register","/api/v1/auth/login","/api/v1/auth/password-reset");
    private static final Set<String> SAFE=Set.of("GET","HEAD","OPTIONS");
    private final IdentityService identity;
    private final String origin;

    public IamWebConfiguration(IdentityService identity,@Value("${peachagent.public-origin}") String origin) {
        this.identity=identity;this.origin=origin;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler) {
                response.setHeader("Cache-Control","no-store");
                String method=request.getMethod(),uri=request.getRequestURI();
                boolean write=!SAFE.contains(method);
                if (write&&!origin.equals(request.getHeader("Origin"))) {
                    throw new DomainException("ORIGIN_DENIED",403,"Request origin not allowed");
                }
                if ("POST".equals(method)&&PUBLIC_POSTS.contains(uri)) return true;
                identity.current();
                if (write) {
                    Object token=StpUtil.getTokenSession().get("csrfToken");
                    if (token==null||!SecurityTokens.equal(token.toString(),request.getHeader("X-CSRF-Token"))) {
                        throw new DomainException("CSRF_DENIED",403,"CSRF validation failed");
                    }
                }
                return true;
            }
        }).addPathPatterns("/api/v1/**");
    }
}
