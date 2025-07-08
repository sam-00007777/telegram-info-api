const { Telegraf } = require('telegraf');
const { Telegram } = require('telegraf');
const moment = require('moment');
const { createHash } = require('crypto');

// DC Locations mapping
const DC_LOCATIONS = {
  1: "MIA, Miami, USA, US",
  2: "AMS, Amsterdam, Netherlands, NL",
  3: "MBA, Mumbai, India, IN",
  4: "STO, Stockholm, Sweden, SE",
  5: "SIN, Singapore, SG",
  6: "LHR, London, United Kingdom, GB",
  7: "FRA, Frankfurt, Germany, DE",
  8: "JFK, New York, USA, US",
  9: "HKG, Hong Kong, HK",
  10: "TYO, Tokyo, Japan, JP",
  11: "SYD, Sydney, Australia, AU",
  12: "GRU, São Paulo, Brazil, BR",
  13: "DXB, Dubai, UAE, AE",
  14: "CDG, Paris, France, FR",
  15: "ICN, Seoul, South Korea, KR"
};

// Known reference points for account age estimation
const REFERENCE_POINTS = [
  [100000000, new Date('2013-08-01')], // Telegram's launch date
  [1273841502, new Date('2020-08-13')],
  [1500000000, new Date('2021-05-01')],
  [2000000000, new Date('2022-12-01')]
];

// Calculate account age
function calculateAccountAge(creationDate) {
  const now = new Date();
  const duration = moment.duration(moment(now).diff(moment(creationDate)));
  
  const years = duration.years();
  const months = duration.months();
  const days = duration.days();
  
  return `${years} years, ${months} months, ${days} days`;
}

// Estimate account creation date based on user ID
function estimateAccountCreationDate(userId) {
  const closestPoint = REFERENCE_POINTS.reduce((prev, curr) => 
    Math.abs(curr[0] - userId) < Math.abs(prev[0] - userId) ? curr : prev
  );
  
  const [closestUserId, closestDate] = closestPoint;
  const idDifference = userId - closestUserId;
  const daysDifference = idDifference / 20000000; // Adjust this ratio as needed
  
  const creationDate = new Date(closestDate);
  creationDate.setDate(creationDate.getDate() + daysDifference);
  
  return creationDate;
}

// Get user status text
function getUserStatus(status) {
  if (!status) return "⚪️ Unknown";
  
  const statusMap = {
    'online': '✅ Online',
    'offline': '❌ Offline',
    'recently': '☑️ Recently online',
    'last_week': '✖️ Last seen within week',
    'last_month': '❎ Last seen within month'
  };
  
  return statusMap[status] || "⚪️ Unknown";
}

module.exports = async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        ok: false,
        error: "Please provide a Telegram URL or username in the 'url' parameter",
        developer: "Mr. Sam"
      });
    }

    // Initialize Telegram client
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const client = new Telegram(process.env.BOT_TOKEN);
    
    // Extract username from URL
    const username = url.replace(/https?:\/\//, '')
                       .replace('t.me/', '')
                       .replace('/', '')
                       .replace('@', '')
                       .trim();

    try {
      let entity;
      let isChat = false;
      
      // Try to get as user first
      try {
        entity = await client.getChat(username);
      } catch (err) {
        // If not found as user, try as chat
        try {
          entity = await client.getChat(`@${username}`);
          isChat = true;
        } catch (err) {
          return res.status(404).json({
            ok: false,
            error: "Telegram entity not found",
            developer: "Tofazzal Hossain"
          });
        }
      }

      // Common fields
      const result = {
        id: entity.id,
        dc_id: entity.dc_id,
        dc_location: DC_LOCATIONS[entity.dc_id] || "Unknown",
        is_verified: entity.is_verified || false,
        is_scam: entity.is_scam || false,
        is_fake: entity.is_fake || false,
        access_hash: createHash('sha256').update(String(entity.id)).digest('hex').slice(0, 16)
      };

      // User-specific fields
      if (!isChat) {
        const creationDate = estimateAccountCreationDate(entity.id);
        const creationDateStr = moment(creationDate).format("MMMM DD, YYYY");
        const age = calculateAccountAge(creationDate);
        
        result.type = "user";
        result.first_name = entity.first_name;
        result.last_name = entity.last_name || "";
        result.username = entity.username;
        result.is_premium = entity.is_premium || false;
        result.status = getUserStatus(entity.status);
        result.is_bot = entity.is_bot || false;
        result.account_created = creationDateStr;
        result.account_age = age;
        
        // Generate profile photo URL if available
        if (entity.photo) {
          result.photo_url = await client.getFileLink(entity.photo.big_file_id);
        } else {
          result.photo_url = process.env.PROFILE_ERROR_URL || "https://example.com/default.jpg";
        }
      } 
      // Chat-specific fields
      else {
        result.type = entity.type;
        result.title = entity.title;
        result.members_count = entity.members_count || 0;
        result.description = entity.description || "";
        
        // Generate chat photo URL if available
        if (entity.photo) {
          result.photo_url = await client.getFileLink(entity.photo.big_file_id);
        } else {
          result.photo_url = process.env.PROFILE_ERROR_URL || "https://example.com/default.jpg";
        }
      }

      // Generate Telegram deep links
      result.links = {
        android: `tg://openmessage?user_id=${entity.id}`,
        ios: `tg://user?id=${entity.id}`,
        web: `https://t.me/${entity.username || entity.id}`
      };

      res.status(200).json({
        ok: true,
        developer: "Mr. Sam",
        result
      });

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        ok: false,
        error: "Internal server error while fetching Telegram data",
        developer: "Mr. Sam"
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      ok: false,
      error: "Internal server error",
      developer: "Mr. Sam"
    });
  }
};
