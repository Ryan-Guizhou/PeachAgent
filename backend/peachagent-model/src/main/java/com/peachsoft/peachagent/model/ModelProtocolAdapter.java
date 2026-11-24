package com.peachsoft.peachagent.model;

/** 受信协议扩展 SPI，禁止在实现中绕过统一受控网络和计量。 */
public interface ModelProtocolAdapter {
    ProtocolDescriptor descriptor();

    void validate(ProtocolConfiguration configuration);

    ModelExecution execute(ModelExecutionRequest request, ModelExecutionContext context) throws Exception;
}
