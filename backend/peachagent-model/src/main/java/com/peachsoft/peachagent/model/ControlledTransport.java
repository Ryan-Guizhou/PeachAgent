package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;

import java.io.Closeable;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Map;

import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.ClassicHttpResponse;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.io.entity.ByteArrayEntity;
import org.apache.hc.core5.util.Timeout;
import org.springframework.stereotype.Component;

/**
 * 独立受控连接，无自动重试、跳转、系统代理或跨租户连接缓存。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:31
 */
@Component
public class ControlledTransport {
    private final NetworkPolicy policy;

    public ControlledTransport(NetworkPolicy policy) {
        this.policy = policy;
    }

    public Session bind(String baseUrl, String authMethod, String secret, int timeoutMs) {
        return new Session(policy.base(baseUrl), authMethod, secret, Math.max(1000, Math.min(timeoutMs, 180000)));
    }
    /**
     * 绑定已验证 origin 与网络策略的受控传输会话。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:31
     */
    public final class Session {
        private final URI base;
        private final String auth;
        private final String secret;
        private final int timeout;

        private Session(URI base, String auth, String secret, int timeout) {
            this.base = base;
            this.auth = auth;
            this.secret = secret;
            this.timeout = timeout;
        }

        public Response post(
                String path,
                byte[] body,
                String contentType,
                Map<String, String> fixedHeaders,
                ModelExecutionContext context)
                throws IOException {
            context.checkActive();
            URI uri = policy.endpoint(base, path);
            boolean internal = policy.internal(base);
            DnsResolver dns = new DnsResolver() {
                @Override
                public InetAddress[] resolve(String host) throws UnknownHostException {
                    if (!host.equalsIgnoreCase(base.getHost())) throw new UnknownHostException("Unexpected route");
                    return NetworkPolicy.resolve(host, internal);
                }

                @Override
                public String resolveCanonicalHostname(String host) throws UnknownHostException {
                    if (!host.equalsIgnoreCase(base.getHost())) throw new UnknownHostException("Unexpected route");
                    return host;
                }
            };
            // 请求参数先校验，避免在创建连接管理器之后因非法参数泄漏资源。
            HttpPost post = new HttpPost(uri);
            if (!"NONE".equals(auth) && (secret == null || secret.isBlank())) {
                throw new DomainException("CREDENTIAL_REQUIRED", 422, "Model credential required");
            }
            if ("BEARER".equals(auth)) {
                post.setHeader("Authorization", "Bearer " + secret);
            } else if ("API_KEY".equals(auth)) {
                post.setHeader("x-api-key", secret);
            } else if (!"NONE".equals(auth)) {
                throw new DomainException("AUTH_UNSUPPORTED", 422, "Authentication not supported");
            }
            fixedHeaders.forEach((name, value) -> {
                if (!name.equalsIgnoreCase("anthropic-version")) {
                    throw new DomainException("HEADER_DENIED", 422, "Unsupported protocol header");
                }
                post.setHeader(name, value);
            });
            post.setEntity(new ByteArrayEntity(body, ContentType.parse(contentType)));

            var manager = PoolingHttpClientConnectionManagerBuilder.create()
                    .setDnsResolver(dns)
                    .setDefaultConnectionConfig(ConnectionConfig.custom()
                            .setConnectTimeout(Timeout.ofSeconds(5))
                            .setSocketTimeout(Timeout.ofMilliseconds(timeout))
                            .build())
                    .build();
            CloseableHttpClient client = HttpClients.custom()
                    .setConnectionManager(manager)
                    .disableAutomaticRetries()
                    .disableRedirectHandling()
                    .disableCookieManagement()
                    .setDefaultRequestConfig(RequestConfig.custom()
                            .setResponseTimeout(Timeout.ofMilliseconds(timeout))
                            .build())
                    .build();
            Closeable cancellation = () -> {
                try {
                    post.cancel();
                } finally {
                    client.close();
                }
            };
            try {
                context.attach(cancellation);
                ClassicHttpResponse response = client.executeOpen(null, post, null);
                int code = response.getCode();
                if (code < 200 || code >= 300) {
                    response.close();
                    throw new DomainException("MODEL_HTTP_" + code, 502, "Model provider rejected request");
                }
                if (response.getEntity() == null) {
                    response.close();
                    throw new DomainException("MODEL_EMPTY_RESPONSE", 502, "Model provider returned no response");
                }
                String mime = response.getEntity().getContentType();
                String requestId = response.getFirstHeader("x-request-id") == null
                        ? null
                        : response.getFirstHeader("x-request-id").getValue();
                return new Response(response, client, cancellation, context, mime, requestId);
            } catch (IOException | RuntimeException error) {
                context.detach(cancellation);
                try {
                    client.close();
                } catch (IOException closeError) {
                    error.addSuppressed(closeError);
                }
                throw error;
            }
        }
    }
    /**
     * 有界响应及其底层资源，消费方负责按契约关闭。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:31
     */
    public static final class Response implements AutoCloseable {
        private final ClassicHttpResponse response;
        private final CloseableHttpClient client;
        private final Closeable cancellation;
        private final ModelExecutionContext context;
        private final String contentType, requestId;

        private Response(
                ClassicHttpResponse response,
                CloseableHttpClient client,
                Closeable cancellation,
                ModelExecutionContext context,
                String contentType,
                String requestId) {
            this.response = response;
            this.client = client;
            this.cancellation = cancellation;
            this.context = context;
            this.contentType = contentType;
            this.requestId = requestId;
        }

        public String contentType() {
            return contentType;
        }

        public String requestId() {
            return requestId;
        }

        public InputStream stream(long limit) throws IOException {
            return new FilterInputStream(response.getEntity().getContent()) {
                long seen;

                private void count(int n) throws IOException {
                    if (n > 0 && (seen += n) > limit) throw new IOException("Model response too large");
                    context.checkActive();
                }

                @Override
                public int read() throws IOException {
                    context.checkActive();
                    int n = super.read();
                    count(n < 0 ? 0 : 1);
                    return n;
                }

                @Override
                public int read(byte[] b, int off, int len) throws IOException {
                    context.checkActive();
                    int n = super.read(b, off, len);
                    count(n);
                    return n;
                }
            };
        }

        @Override
        public void close() throws IOException {
            context.detach(cancellation);
            try {
                response.close();
            } finally {
                client.close();
            }
        }
    }
}
