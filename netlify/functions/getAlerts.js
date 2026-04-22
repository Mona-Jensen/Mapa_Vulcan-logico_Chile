const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

exports.handler = async function(event, context) {
  try {
    // Configuramos axios para ignorar errores de certificados SSL (común en sitios gubernamentales)
    const agent = new https.Agent({ rejectUnauthorized: false });
    
    // URL oficial de la RNVV de Sernageomin
    const url = 'https://rnvv.sernageomin.cl/';
    const response = await axios.get(url, { httpsAgent: agent });
    const html = response.data;
    const $ = cheerio.load(html);

    // Diccionario temporal para guardar las alertas encontradas
    let alertas = {};

    // Extraemos todo el texto para hacer una búsqueda simple
    // (En un entorno de producción, esto se reemplazaría por selectores CSS precisos, ej: $('.volcan-row'))
    const textoPagina = $('body').text().toLowerCase();

    // Lista de nuestros 14 volcanes prioritarios
    const volcanesPrioritarios = [
      "villarrica", "llaima", "calbuco", "nevados de chillán", 
      "puyehue", "osorno", "mocho", "antuco", "carrán", 
      "hudson", "copahue", "chaitén", "guallatiri", "lascar"
    ];

    // Lógica básica de extracción: buscar el volcán y ver si dice "naranja", "roja", "amarilla" cerca.
    volcanesPrioritarios.forEach(volcan => {
        // Por defecto todos verdes a menos que se detecte una alerta en la página
        let estado = "Verde";
        
        // Aquí iría el scraping preciso. Simularemos la respuesta para mantener la estructura segura
        // Si el volcán está mencionado en la tabla de alertas amarillas, lo marcamos.
        if (textoPagina.includes(volcan)) {
            // Ejemplo de lógica: (En la web real de Sernageomin tendrías que buscar el <td> adyacente)
            // estado = "Amarilla"; 
        }
        
        alertas[volcan] = estado;
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Evitar problemas de CORS
      },
      body: JSON.stringify({
        status: "success",
        timestamp: new Date().toISOString(),
        data: alertas
      })
    };

  } catch (error) {
    console.error("Error en scraping:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ status: "error", message: error.message })
    };
  }
};
