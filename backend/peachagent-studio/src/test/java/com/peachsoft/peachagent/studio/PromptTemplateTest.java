package com.peachsoft.peachagent.studio;

import com.peachsoft.peachagent.common.DomainException;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PromptTemplateTest {
    @Test void literalAndTypedVariables(){
        var schema=Map.<String,Object>of("name",Map.of("type","string","required",true));
        assertEquals("Hello {{other}}",PromptTemplate.render("Hello {{name}}",schema,Map.of("name","{{other}}")));
        assertThrows(DomainException.class,()->PromptTemplate.render("Hello {{name}}",schema,Map.of()));
        assertThrows(DomainException.class,()->PromptTemplate.render("Hello {{name}}",schema,Map.of("name",1)));
        assertThrows(DomainException.class,()->PromptTemplate.validate("{{T(java.lang.Runtime)}}",Map.of()));
    }
}
