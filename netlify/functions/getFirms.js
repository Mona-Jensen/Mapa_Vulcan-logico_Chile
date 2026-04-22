exports.handler = async function(event, context) {
  // Aquí iría tu lógica real para conectarte a NASA FIRMS
  // La API Key la puedes guardar en las variables de entorno de Netlify
  // process.env.NASA_FIRMS_KEY

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "mock",
      message: "API de NASA FIRMS lista para implementarse.",
      data: [] 
    })
  };
};
