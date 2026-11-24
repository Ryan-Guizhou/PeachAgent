package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 每次 DNS 解析验证实际地址；仅部署者可允许指定内部 origin。 */
@Component
public class NetworkPolicy {
    private final Set<String> internalOrigins;
    public NetworkPolicy(@Value("${peachagent.allowed-internal-origins:}") String origins) {
        var configured=new HashSet<String>();
        for(String value:origins.split(",")) if(!value.isBlank())configured.add(origin(parse(value.strip())));
        internalOrigins=Set.copyOf(configured);
    }

    public URI base(String value) {
        URI uri=parse(value);
        boolean internal=internalOrigins.contains(origin(uri));
        if(!internal&&(!"https".equals(uri.getScheme())||port(uri)!=443))throw denied();
        String path=uri.getRawPath();
        if(path!=null&&(path.contains("%")||path.contains("..")||path.contains("\\")))throw denied();
        resolve(uri.getHost(),internal);
        String normalized=uri.toString();
        return URI.create(normalized.endsWith("/")?normalized:normalized+"/");
    }

    public URI endpoint(URI base,String path) {
        if(path==null||!path.matches("[A-Za-z0-9/_-]+")||path.startsWith("/")||path.contains(".."))throw denied();
        URI result=base.resolve(path);
        if(!origin(base).equals(origin(result)))throw denied();
        return result;
    }

    public boolean internal(URI uri){return internalOrigins.contains(origin(uri));}

    public static String origin(URI uri) {
        return uri.getScheme().toLowerCase(Locale.ROOT)+"://"+uri.getHost().toLowerCase(Locale.ROOT)+":"+port(uri);
    }
    private static int port(URI uri){return uri.getPort()==-1?("https".equals(uri.getScheme())?443:80):uri.getPort();}
    private static URI parse(String value) {
        try {
            URI uri=URI.create(value);
            if(!Set.of("https","http").contains(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||
                    uri.getRawQuery()!=null||uri.getRawFragment()!=null||port(uri)<=0||port(uri)>65535)throw denied();
            return uri;
        }catch(IllegalArgumentException ex){throw denied();}
    }
    public static InetAddress[] resolve(String host,boolean internal) {
        try {
            InetAddress[] ips=InetAddress.getAllByName(host);
            if(ips.length==0||Arrays.stream(ips).anyMatch(ip->!allowed(ip,internal)))throw denied();
            return ips;
        }catch(UnknownHostException e){throw new DomainException("MODEL_DNS_FAILED",422,"Model hostname resolution failed");}
    }
    static boolean allowed(InetAddress ip,boolean internal) {
        byte[] b=ip.getAddress();
        if(ip.isAnyLocalAddress()||ip.isLinkLocalAddress()||ip.isMulticastAddress())return false;
        if(b.length==4){
            int a=b[0]&255,c=b[1]&255,d=b[2]&255,e=b[3]&255;
            if(a==0||a>=224||(a==169&&c==254)||(a==100&&c>=64&&c<=127)||(a==192&&c==0&&d==0)
                    ||(a==192&&c==0&&d==2)||(a==198&&(c==18||c==19||c==51&&d==100))||(a==203&&c==0&&d==113))return false;
            // 部署者也不能通过 allowlist 访问云元数据地址。
            if(a==100&&c==100&&d==100&&e==200)return false;
        }else if(b.length==16){
            int first=b[0]&255,second=b[1]&255;
            if((first&0xfe)==0xfc&&!internal)return false;
            // 仅公共 global unicast 或明确允许的本地地址；拒绝映射/转换/特殊地址。
            if(!internal&&(first&0xe0)!=0x20)return false;
            if(first==0x20&&second==0x01&&(b[2]&255)==0x0d&&(b[3]&255)==0xb8)return false;
        }else return false;
        return internal||(!ip.isLoopbackAddress()&&!ip.isSiteLocalAddress());
    }
    private static DomainException denied(){return new DomainException("MODEL_ENDPOINT_DENIED",422,"Model endpoint blocked by network policy");}
}
