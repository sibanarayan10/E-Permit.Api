const { LOCATIONS, SUB_LOCATIONS } = require("../config/constants");

exports.getLocations = (req, res) => {
  return res.status(200).json({
    success: true,
    data: Object.values(LOCATIONS)
  });
};

exports.getSubLocations = (req, res) => {
  const { location } = req.params;

  if (!SUB_LOCATIONS[location]) {
    return res.status(400).json({
      success: false,
      message: "Invalid location"
    });
  }

  return res.status(200).json({
    success: true,
    data: SUB_LOCATIONS[location]
  });
};
