package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Comparator;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;

/** 注册原子化；重复协议版本拒绝而非覆盖或按注册顺序回退。 */
@Component
public class ModelProtocolRegistry {
    private final AtomicReference<Map<ProtocolKey,ModelProtocolAdapter>> adapters = new AtomicReference<>(Map.of());

    public ModelProtocolRegistry(List<ModelProtocolAdapter> discovered) {
        discovered.forEach(this::register);
    }

    public void register(ModelProtocolAdapter adapter) {
        ProtocolDescriptor descriptor=adapter.descriptor();
        adapters.updateAndGet(current -> {
            if (current.containsKey(descriptor.protocol())) {
                throw new IllegalStateException("Duplicate protocol registration: "+descriptor.protocol());
            }
            var next=new HashMap<>(current);
            next.put(descriptor.protocol(),adapter);
            return Map.copyOf(next);
        });
    }

    public List<ProtocolDescriptor> list() {
        return adapters.get().values().stream().map(ModelProtocolAdapter::descriptor)
                .sorted(Comparator.comparing(d -> d.protocol().key()+"/"+d.protocol().version())).toList();
    }

    public ModelProtocolAdapter resolve(ProtocolKey protocol,String type,String operation) {
        var adapter=adapters.get().get(protocol);
        if (adapter==null) throw new DomainException("MODEL_PROTOCOL_UNAVAILABLE",422,"Model protocol unavailable");
        if (!adapter.descriptor().supports(type,operation)) {
            throw new DomainException("MODEL_OPERATION_UNSUPPORTED",422,"Model operation not supported by protocol");
        }
        return adapter;
    }

    public ModelProtocolAdapter resolvePinned(ProtocolKey protocol,String type,String operation,String key,String version) {
        var adapter=resolve(protocol,type,operation);
        if (!adapter.descriptor().adapterKey().equals(key)||!adapter.descriptor().adapterVersion().equals(version)) {
            throw new DomainException("MODEL_PROTOCOL_VERSION_UNSUPPORTED",409,"Pinned adapter version unavailable");
        }
        return adapter;
    }
}
