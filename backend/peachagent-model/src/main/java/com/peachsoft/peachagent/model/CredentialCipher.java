package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** AES-GCM 信封加密；KEK 不进入数据库，AAD 绑定资源、版本和 origin。 */
@Component
public class CredentialCipher {
    private static final SecureRandom RANDOM=new SecureRandom();
    private final byte[] kek;
    private final String kekVersion;
    public record Encrypted(byte[] ciphertext,byte[] nonce,byte[] wrappedDek,String kekVersion) { }

    public CredentialCipher(@Value("${peachagent.credential-kek:}") String key,
                            @Value("${peachagent.credential-kek-version:1}") String version){
        if(key.isBlank()){kek=null;}else{
            try{kek=Base64.getDecoder().decode(key);}catch(IllegalArgumentException e){throw new IllegalStateException("Invalid credential KEK encoding");}
            if(kek.length!=32)throw new IllegalStateException("Credential KEK must be 32 bytes");
        }
        kekVersion=version;
    }
    private byte[] requireKey(){if(kek==null)throw new DomainException("CREDENTIAL_VAULT_UNCONFIGURED",503,"Credential vault is not configured");return kek;}
    private static byte[] random(int size){byte[] value=new byte[size];RANDOM.nextBytes(value);return value;}
    private static byte[] crypt(int mode,byte[] key,byte[] nonce,byte[] aad,byte[] value)throws GeneralSecurityException{
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(mode,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,nonce));cipher.updateAAD(aad);return cipher.doFinal(value);
    }
    public Encrypted encrypt(String secret,String aad){
        if(secret==null||secret.isBlank()||secret.length()>8192||secret.contains("\r")||secret.contains("\n"))
            throw new DomainException("INVALID_CREDENTIAL",422,"Invalid credential value");
        byte[] dek=random(32),nonce=random(12),wrapNonce=random(12),plain=secret.getBytes(StandardCharsets.UTF_8);
        try{
            byte[] ctx=aad.getBytes(StandardCharsets.UTF_8);
            byte[] encrypted=crypt(Cipher.ENCRYPT_MODE,dek,nonce,ctx,plain);
            byte[] wrapped=crypt(Cipher.ENCRYPT_MODE,requireKey(),wrapNonce,ctx,dek);
            byte[] combined=Arrays.copyOf(wrapNonce,wrapNonce.length+wrapped.length);
            System.arraycopy(wrapped,0,combined,12,wrapped.length);
            return new Encrypted(encrypted,nonce,combined,kekVersion);
        }catch(GeneralSecurityException e){throw new IllegalStateException("Credential encryption failed");}
        finally{Arrays.fill(dek,(byte)0);Arrays.fill(plain,(byte)0);}
    }
    public String decrypt(Encrypted value,String aad){
        if(!kekVersion.equals(value.kekVersion()))throw new DomainException("CREDENTIAL_KEY_UNAVAILABLE",503,"Credential key version unavailable");
        byte[] dek=null,plain=null;
        try{
            byte[] ctx=aad.getBytes(StandardCharsets.UTF_8);
            dek=crypt(Cipher.DECRYPT_MODE,requireKey(),Arrays.copyOfRange(value.wrappedDek(),0,12),ctx,
                    Arrays.copyOfRange(value.wrappedDek(),12,value.wrappedDek().length));
            plain=crypt(Cipher.DECRYPT_MODE,dek,value.nonce(),ctx,value.ciphertext());
            return new String(plain,StandardCharsets.UTF_8);
        }catch(GeneralSecurityException|IllegalArgumentException e){throw new DomainException("CREDENTIAL_DECRYPT_FAILED",503,"Credential unavailable");}
        finally{if(dek!=null)Arrays.fill(dek,(byte)0);if(plain!=null)Arrays.fill(plain,(byte)0);}
    }
}
