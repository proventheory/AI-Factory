export const LAYOUTS_HEADER = [
  {
    layout: 'Full-Width Image Header',
    background: 'High-quality full-width image',
    elements: ['Centered Company Logo', 'Overlay Text: Tagline or short message', 'Optional: Navigation Links'],
    constraints: {
      image_ratio: '16:9 or 4:3',
      text_alignment: 'Centered over the image',
      overlay_opacity: 'Semi-transparent for readability'
    },
    patterns: ['Diagonal lines or subtle texture overlay', 'Gradient overlay for text visibility']
  },
  {
    layout: 'Split Header with Logo and Navigation',
    background: 'Solid or gradient color',
    elements: ['Left-Aligned Logo', 'Right-Aligned Navigation Links', 'Optional: Search Icon'],
    constraints: {
      split_ratio: '30:70 or 40:60',
      alignment: 'Vertical center alignment for elements',
      spacing: 'Even space between navigation links'
    },
    patterns: ['Horizontal stripes or subtle patterns', 'Textured background for depth']
  },
  {
    layout: 'Centered Logo with Tagline',
    background: 'Minimalist solid color',
    elements: ['Centered Logo', 'Tagline or Intro Text Below', 'Optional: Social Media Icons'],
    constraints: {
      logo_ratio: '1:1',
      text_alignment: 'Centered below the logo',
      padding: 'Generous padding around logo'
    },
    patterns: ['Subtle geometric shapes', 'Faint grid lines for structure']
  },
  {
    layout: 'Top Bar with Contact Information',
    background: 'Contrasting top bar color',
    elements: [
      'Top Bar: Contact Info and Social Media Icons',
      'Main Header with Centered Logo',
      'Optional: Subheadline or Offer Text'
    ],
    constraints: {
      bar_ratio: '1:10 of the header height',
      alignment: 'Left or right for contact info',
      text_contrast: 'High contrast for top bar text'
    },
    patterns: ['Horizontal line or shadow under the top bar', 'Gradient for the main header section']
  },

  //   {
  //     layout: 'Hero Image with Centered Content',
  //     background: 'Full-width hero image',
  //     elements: ['Centered Logo and Headline', 'Subheadline Below the Headline', 'Optional: CTA Button'],
  //     constraints: {
  //       image_ratio: '16:9',
  //       text_alignment: 'Centered with balanced spacing',
  //       contrast: 'High contrast for text over the image'
  //     },
  //     patterns: ['Soft gradient overlay', 'Subtle vignette effect']
  //   },
  {
    layout: 'Layered Header with Depth',
    background: 'Layered colors or textures',
    elements: ['Logo Integrated into Layered Design', 'Headline Across the Layers', 'Optional: Navigation Links'],
    constraints: {
      layer_depth: 'Subtle shadows for depth effect',
      alignment: 'Elements aligned with layers',
      spacing: 'Consistent spacing across layers'
    },
    patterns: ['Layered paper effect', 'Subtle 3D patterns']
  },
  {
    layout: 'Interactive-Looking Header',
    background: 'Solid or gradient with visual cues',
    elements: [
      'Left-Aligned Logo',
      'Right-Aligned Interactive-Looking Navigation Links',
      'Optional: CTA Button or Special Announcement'
    ],
    constraints: {
      text_alignment: 'Consistent alignment for all text',
      spacing: 'Even spacing between elements',
      hover_effect: 'Color change or underline on hover'
    },
    patterns: ['Dynamic line patterns', 'Faint interactive-looking grid']
  }
]

export const LAYOUTS_HERO = [
  {
    layout: 'Full-Width Image Hero',
    background: 'High-quality full-width image',
    elements: [
      'Overlaid Headline: Bold and attention-grabbing',
      'Subheadline: Supporting text just below the headline',
      'Centered CTA Button: Prominent and styled to stand out'
    ],
    constraints: {
      image_ratio: '16:9 or 3:2',
      text_alignment: 'Centered for balance',
      overlay_opacity: 'Adjustable for text readability'
    },
    patterns: ['Diagonal lines as an overlay', 'Subtle gradient from top to bottom']
  },
  {
    layout: 'Split Hero with Image and Text',
    background: 'Half image, half solid color',
    elements: [
      'Image on one side',
      'Text content including Headline and Subheadline on the other',
      'CTA Button aligned with the text'
    ],
    constraints: {
      split_ratio: '50:50 or 60:40 depending on emphasis',
      text_alignment: 'Left or right aligned with the image opposite',
      padding: 'Consistent padding for text'
    },
    patterns: ['Zig-zag line separating image and text', 'Soft gradient in the text area']
  },
  {
    layout: 'Gradient Background Hero',
    background: 'Vibrant gradient',
    elements: [
      'Large Headline prominently displayed',
      'Subheadline: Brief and engaging',
      'CTA Button: Clearly visible and inviting'
    ],
    constraints: {
      gradient_angle: '45 or 90 degrees for dynamic feel',
      text_color: 'High contrast against the gradient',
      spacing: 'Generous space between text elements'
    },
    patterns: ['Radial gradient from the center', 'Layered gradient with multiple colors']
  },
  {
    layout: 'Minimalist Hero with Bold Text',
    background: 'Solid or subtle textured background',
    elements: [
      'Large, Centered Headline: Minimal text with impact',
      'Subheadline: Simple and concise',
      'CTA Button: Clear and inviting'
    ],
    constraints: {
      text_size_ratio: '2:1 for headline to subheadline',
      alignment: 'Fully centered for a clean look',
      margin: 'Wide margins for breathing room'
    },
    patterns: ['Subtle texture like linen or paper', 'Geometric shapes faintly in the background']
  },
  {
    layout: 'Overlay Hero with Image',
    background: 'Image with color overlay',
    elements: [
      'Headline: Positioned over the image',
      'Subheadline: Below the headline',
      'CTA Button: Prominent below text block'
    ],
    constraints: {
      overlay_opacity: 'Adjustable for text visibility',
      image_focal_point: 'Centred or aligned with text',
      alignment: 'Centered or aligned to focal interest'
    },
    patterns: ['Soft vignette effect on edges', 'Diagonal or vertical stripe overlay']
  },
  {
    layout: 'Layered Hero with Text and Image',
    background: 'Layered images or graphics',
    elements: [
      'Text Block: Headline and Subheadline',
      'Layered Product Image: Positioned strategically',
      'CTA Button: Floating or integrated into design'
    ],
    constraints: {
      layer_depth: 'Subtle shadow or outline for depth',
      text_position: 'Strategically placed for balance',
      image_ratio: 'Flexible, depending on layout'
    },
    patterns: ['Layered paper or cut-out effect', 'Watercolor or paint texture overlay']
  },
  {
    layout: 'Interactive Look Hero without Animation',
    background: 'Dynamic pattern or detailed image',
    elements: [
      'Headline: Large, with vibrant color',
      'Subheadline: Engaging and descriptive',
      'CTA Button: Eye-catching'
    ],
    constraints: {
      background_detail: 'Not too busy for readability',
      text_contrast: 'High contrast against background',
      button_size_ratio: '1:3 ratio compared to headline'
    },
    patterns: ['Abstract geometric patterns', 'Organic shapes interwoven']
  }
]

export const LAYOUTS_PRODUCT_DETAIL = [
  {
    layout: 'Zig-Zag Layout',
    background: 'Alternating sections with light and dark backgrounds',
    elements: [
      'Product Image: Alternates sides with each product',
      'Product Description: Opposite side of the image',
      'Pricing and CTA Button: Below the description'
    ],
    constraints: {
      image_alignment: 'Alternating alignment for visual interest',
      image_ratio: '1:1 or 4:3 depending on product shape',
      text_alignment: 'Left for image on right, right for image on left',
      padding: 'Consistent padding between sections',
      text_width: 'Consistent width for a balanced look',
      button_style: 'Consistent color and size across products'
    },
    patterns: ['Diagonal lines between sections', 'Subtle background gradient transition']
  },
  {
    layout: 'Grid Layout',
    background: 'Solid or patterned background for entire section',
    elements: [
      'Multiple Product Images in a grid format',
      'Product Name and Brief Description below each image',
      'Pricing and CTA Button below description'
    ],
    constraints: {
      grid_columns: '2 or 3 columns depending on email width',
      image_ratio: 'Square or portrait to fit grid cells',
      spacing: 'Equal spacing between grid items'
    },
    patterns: ['Checkerboard pattern with alternating backgrounds', 'Subtle dotted grid lines']
  },
  {
    layout: 'Vertical Stacked Layout',
    background: 'Neutral background color to focus on products',
    elements: [
      'Large Product Image',
      'Product Title and Description below image',
      'Pricing Information',
      'CTA Button prominently displayed'
    ],
    constraints: {
      image_ratio: '2:3 for portrait images',
      text_alignment: 'Centered for a balanced look',
      margin: 'Generous margin between elements'
    },
    patterns: ['Vertical stripe pattern in the background', 'Faint geometric shapes']
  },
  {
    layout: 'Feature List Layout',
    background: 'Solid background with accent color sections',
    elements: ['Product Image on one side', 'Features List on the other side', 'Pricing and CTA Button below features'],
    constraints: {
      image_ratio: '1:1 or 16:9',
      list_style: 'Bulleted or icons for each feature',
      alignment: 'Centered alignment for text'
    },
    patterns: ['Horizontal lines to separate features', 'Subtle iconography patterns']
  },
  {
    layout: 'Side-by-Side Layout',
    background: 'Solid or textured background with dividing line',
    elements: ['Product Image on the left', 'Product Details on the right', 'CTA Button below details'],
    constraints: {
      image_ratio: '4:3',
      text_alignment: 'Left-aligned for consistency',
      border: 'Thin line between image and text'
    },
    patterns: ['Diagonal stripes across the section', 'Muted polka dots']
  },
  {
    layout: 'Carousel Layout',
    background: 'Neutral or dark background to highlight images',
    elements: [
      'Rotating Product Images',
      'Brief Description with each image',
      'Pricing and CTA Button with each rotation'
    ],
    constraints: {
      image_ratio: '3:2',
      carousel_controls: 'Dots or arrows for navigation',
      text_position: 'Overlay or below image'
    },
    patterns: ['Circular patterns in the background', 'Soft gradient overlay']
  },
  {
    layout: 'Layered Layout',
    background: 'Layered background with depth effect',
    elements: ['Product Image with shadow effect', 'Product Details layered over background', 'CTA Button floating'],
    constraints: {
      image_ratio: 'Square or custom crop',
      layer_depth: 'Subtle drop shadows for depth',
      alignment: 'Layered elements should align naturally'
    },
    patterns: ['Layered paper effect', 'Subtle 3D patterns']
  }
]

export const LAYOUTS_OFFER_DETAIL = [
  {
    layout: 'Highlight Box Layout',
    background: 'Solid color accent box within a neutral background',
    elements: [
      'Offer Headline: Bold and prominent within the box',
      'Detailed Offer Description: Key details about the offer',
      'Terms and Conditions: Briefly listed below the description',
      'CTA Button: Positioned at the bottom of the box'
    ],
    constraints: {
      box_ratio: '16:9',
      text_alignment: 'Centered for headline, left-aligned for description',
      padding: 'Generous padding inside the box'
    },
    patterns: ['Subtle shadow around the box', 'Soft gradient within the box']
  },
  {
    layout: 'Side-by-Side Offer Layout',
    background: 'Split background with contrasting colors',
    elements: [
      'Offer Headline and Description on the left',
      'Visual Element or Icon on the right',
      'CTA Button below the description'
    ],
    constraints: {
      split_ratio: '50:50 or 60:40 depending on content',
      alignment: 'Left for text, centered for visuals',
      divider: 'Thin line or space between sections'
    },
    patterns: ['Diagonal split between colors', 'Textured pattern on one side for contrast']
  },
  {
    layout: 'Accordion Offer Layout',
    background: 'Solid or subtle patterned background',
    elements: [
      'Offer Headline: Clickable to expand details',
      'Expandable Offer Details: Hidden until clicked',
      'Terms and Conditions: Within expanded section',
      'CTA Button: Always visible below the headline'
    ],
    constraints: {
      headline_style: 'Bold and easy to identify',
      expandable_ratio: '1:2 when expanded',
      transition: 'Smooth transition for expansion'
    },
    patterns: ['Chevron or arrow icon indicating expandable section', 'Dotted or dashed lines separating sections']
  },
  {
    layout: 'Full-Width Banner Offer',
    background: 'Large, eye-catching banner',
    elements: [
      'Offer Headline: Centered and bold across the banner',
      'Subheadline or Key Points: Below the headline',
      'Terms and Conditions: In smaller text at the bottom',
      'CTA Button: Prominent and centered'
    ],
    constraints: {
      banner_ratio: '3:1',
      text_contrast: 'High contrast for readability',
      spacing: 'Adequate space between text elements'
    },
    patterns: ['Wavy or curved lines along the top or bottom', 'Gradient overlay for text emphasis']
  },
  {
    layout: 'Infographic Style Offer',
    background: 'Neutral background to highlight infographic',
    elements: [
      'Offer Headline: At the top of infographic',
      'Infographic Elements: Key offer details presented visually',
      'CTA Button: Below the infographic, encouraging action'
    ],
    constraints: {
      infographic_ratio: '2:3 or custom to fit content',
      iconography: 'Consistent icon style throughout',
      alignment: 'Centered or justified for clarity'
    },
    patterns: ['Geometric shapes to segment infographic', 'Color-coding for different sections']
  },
  {
    layout: 'Card-Based Offer Layout',
    background: 'Multiple cards over a subtle background',
    elements: [
      'Each card: Offer Headline, Short Description, and CTA Button',
      'Terms and Conditions: Below all cards or on each card'
    ],
    constraints: {
      card_ratio: '4:5 or square',
      spacing: 'Consistent space between cards',
      alignment: 'Center or edge aligned for uniformity'
    },
    patterns: ['Shadow or border around each card', 'Alternating colors or textures for cards']
  },
  {
    layout: 'Layered Text Layout',
    background: 'Layered effect with overlapping elements',
    elements: [
      'Prominent Offer Headline',
      'Detailed Description layered beneath headline',
      'CTA Button at the forefront'
    ],
    constraints: {
      layer_depth: 'Subtle shadow or outline for depth',
      text_alignment: 'Left or centered for main text',
      layer_spacing: 'Slight overlap for emphasis'
    },
    patterns: ['Layered paper or cut-out effect', 'Subtle 3D patterns for depth']
  }
]

export const LAYOUTS_SOCIAL_PROOF = [
  {
    layout: 'Testimonial Grid Layout',
    background: 'Solid or light patterned background',
    elements: [
      'Grid of Customer Testimonials',
      'Each Testimonial: Customer Photo, Quote, Name',
      'Star Ratings Below Quotes'
    ],
    constraints: {
      grid_columns: '2 or 3 columns depending on email width',
      image_ratio: '1:1 for customer photos',
      spacing: 'Equal spacing between grid items'
    },
    patterns: ['Subtle grid lines', 'Alternating background colors for each testimonial']
  },
  {
    layout: 'Carousel Testimonial Layout',
    background: 'Neutral background for emphasis on content',
    elements: [
      'Rotating Testimonials with Customer Photos',
      'Quote, Name, and Star Ratings for each',
      'Navigation Dots or Arrows for Carousel'
    ],
    constraints: {
      carousel_controls: 'Dots or arrows for navigation',
      text_alignment: 'Centered or left-aligned',
      image_ratio: 'Circle crop for customer photos'
    },
    patterns: ['Soft gradient background', 'Overlay patterns for carousel slides']
  },
  {
    layout: 'Single Testimonial Focus',
    background: 'Accent color background for standout effect',
    elements: ['Large Customer Photo', 'Prominent Quote', 'Customer Name and Star Rating Below'],
    constraints: {
      photo_ratio: '1:1 with a focus on face',
      text_alignment: 'Centered for balance',
      padding: 'Generous padding around text'
    },
    patterns: ['Shadow or outline around testimonial box', 'Diagonal lines in background']
  },
  {
    layout: 'Mixed Media Social Proof',
    background: 'Textured or patterned background',
    elements: [
      'Combination of Testimonials and Logos of Featured Publications',
      'Quotes with Customer Photos',
      'Logos Displayed Below Testimonials'
    ],
    constraints: {
      logo_alignment: 'Centered or grid layout for logos',
      photo_ratio: 'Square or circle crop',
      text_alignment: 'Left for testimonials'
    },
    patterns: ['Geometric shapes in background', 'Subtle texture overlay']
  },
  {
    layout: 'Rating and Review Layout',
    background: 'Light gradient background',
    elements: ['Average Star Rating Display', 'Multiple Short Customer Reviews', 'CTA Button for More Reviews'],
    constraints: {
      rating_alignment: 'Centered',
      review_spacing: 'Consistent spacing between reviews',
      button_style: 'Prominent and inviting'
    },
    patterns: ['Star pattern in background', 'Horizontal lines separating reviews']
  },
  {
    layout: 'Vertical Testimonial List',
    background: 'Subtle pattern or solid color',
    elements: ['Stacked Testimonials with Photos', 'Quote and Name for each', 'Star Ratings Included'],
    constraints: {
      list_alignment: 'Left or centered',
      photo_ratio: '1:1 with a focus on face',
      spacing: 'Adequate space between testimonials'
    },
    patterns: ['Vertical stripes', 'Subtle dotted lines']
  },
  {
    layout: 'Social Media Proof',
    background: 'Neutral or branded color background',
    elements: [
      'Screenshots or Quotes from Social Media',
      'Star Ratings or Like Counts',
      'Social Media Icons for Platforms'
    ],
    constraints: {
      icon_size: 'Consistent size across icons',
      text_alignment: 'Left-aligned for clarity',
      spacing: 'Consistent spacing between social media elements'
    },
    patterns: ['Circular patterns representing social media icons', 'Muted color accents']
  }
]

export const LAYOUTS_ADDITIONAL_PRODUCTS_RECOMMENDATIONS = [
  {
    layout: 'Carousel Layout',
    background: 'Neutral or light background to highlight products',
    elements: ['Rotating Product Images', 'Product Name and Price below each image', 'CTA Button with each product'],
    constraints: {
      image_ratio: '1:1 or 4:3',
      carousel_controls: 'Dots or arrows for navigation',
      spacing: 'Consistent margin between carousel items'
    },
    patterns: ['Subtle shadow under each product card', 'Gradient highlight on active item']
  },
  {
    layout: 'Grid Layout',
    background: 'Simple background to focus on product images',
    elements: [
      'Product Images arranged in a grid',
      'Product Title and Price below each image',
      'CTA Button under each product description'
    ],
    constraints: {
      grid_columns: '2 to 4 columns depending on email width',
      image_ratio: 'Square or portrait',
      padding: 'Uniform padding around each grid item'
    },
    patterns: ['Checkerboard pattern with alternating backgrounds', 'Faint dotted grid lines']
  },
  {
    layout: 'Horizontal Scroll Layout',
    background: 'Solid color or subtle gradient',
    elements: [
      'Horizontally scrolling row of products',
      'Product Name and Price under each image',
      'CTA Button with each product'
    ],
    constraints: {
      scroll_direction: 'Horizontal with visible scroll indicators',
      image_ratio: '3:2',
      alignment: 'Center-aligned text'
    },
    patterns: ['Horizontal stripe pattern in the background', 'Muted polka dots']
  },
  {
    layout: 'Stacked Card Layout',
    background: 'Layered or textured background',
    elements: [
      'Stacked cards with product images',
      'Product Details and Price on each card',
      'CTA Button at the bottom of each card'
    ],
    constraints: {
      card_ratio: '4:5',
      layer_depth: 'Subtle shadow for depth',
      spacing: 'Even spacing between stacked cards'
    },
    patterns: ['Layered paper effect', 'Subtle 3D patterns']
  },
  {
    layout: 'List Layout',
    background: 'Clean, minimalist background',
    elements: [
      'Vertical list of products',
      'Product Name, Description, and Price next to each image',
      'CTA Button beside product details'
    ],
    constraints: {
      list_style: 'Vertical with equal spacing',
      image_ratio: '1:1',
      alignment: 'Left-aligned text for readability'
    },
    patterns: ['Dashed lines between list items', 'Subtle gradient background']
  },
  {
    layout: 'Masonry Layout',
    background: 'Neutral background to highlight product diversity',
    elements: [
      'Masonry-style arrangement of products',
      'Product Title and Price below each image',
      'CTA Button under each product description'
    ],
    constraints: {
      masonry_columns: 'Dynamic column count based on viewport',
      image_ratio: 'Varied for visual interest',
      spacing: 'Consistent spacing between items'
    },
    patterns: ['Irregular grid pattern', 'Light texture overlay']
  },
  {
    layout: 'Feature Highlight Layout',
    background: 'Contrasting background to emphasize features',
    elements: [
      'Larger Product Image with details',
      'Smaller Recommended Products with images',
      'CTA Button for each product'
    ],
    constraints: {
      feature_ratio: 'Larger image: 2:1 compared to smaller images',
      alignment: 'Centered for main product, grid for others',
      spacing: 'Generous space around featured product'
    },
    patterns: ['Highlight effect around main product', 'Diagonal lines to separate sections']
  }
]

export const LAYOUTS_URGENTCY_SCARITY = [
  {
    layout: 'Countdown Timer Banner',
    background: 'Bold, attention-grabbing color',
    elements: [
      'Countdown Timer: Large and prominently displayed',
      'Urgency Message: Short and impactful alongside the timer',
      'Supporting Text: Brief details about the offer or deadline',
      'CTA Button: Positioned below the timer'
    ],
    constraints: {
      timer_alignment: 'Centered or justified with text',
      color_contrast: 'High contrast for readability',
      padding: 'Ample padding around elements'
    },
    patterns: ['Horizontal stripes for emphasis', 'Gradient background to draw attention']
  },
  {
    layout: 'Limited Stock Alert Box',
    background: 'Solid color with alert icon',
    elements: [
      'Alert Icon: Next to the headline for immediate attention',
      'Headline: Emphasizing limited availability',
      'Stock Indicator Bar: Visual representation of stock level',
      'CTA Button: Encourages immediate action'
    ],
    constraints: {
      icon_ratio: '1:1 with headline',
      text_alignment: 'Left-aligned for clarity',
      bar_color: 'Dynamic color change based on stock level'
    },
    patterns: ['Diagonal lines for urgency', 'Textured overlay on the alert box']
  },
  {
    layout: 'Flash Sale Layout',
    background: 'Dynamic, high-energy background',
    elements: [
      'Flash Sale Headline: Bold and large',
      'Subheadline: Details about the sale duration',
      'CTA Button: Prominent and inviting',
      'Terms and Conditions: Small text below'
    ],
    constraints: {
      headline_style: 'Bold and uppercase',
      alignment: 'Centered for main elements',
      spacing: 'Tight spacing for a compact look'
    },
    patterns: ['Lightning bolt or explosion graphics', 'Subtle glowing effect around elements']
  },
  {
    layout: 'Urgency Bar',
    background: 'Neutral with a standout urgency bar',
    elements: [
      'Urgency Bar: Span across the width with key message',
      'Supporting Text: Details about the urgency',
      'CTA Button: Below the urgency bar'
    ],
    constraints: {
      bar_height_ratio: '1:10 of the section height',
      text_contrast: 'High contrast against the bar',
      alignment: 'Text centered within the bar'
    },
    patterns: ['Chevron pattern within the bar', 'Gradient transition along the bar']
  },
  {
    layout: 'Limited Time Offer Badge',
    background: 'Clean with a prominent badge',
    elements: [
      'Offer Badge: Positioned at the top or corner',
      'Headline: Emphasizing the limited time',
      'Supporting Details: Below the headline',
      'CTA Button: Encourages immediate action'
    ],
    constraints: {
      badge_ratio: '1:1 or 16:9',
      alignment: 'Centered or top-aligned for badge',
      spacing: 'Consistent space between elements'
    },
    patterns: ['Circular or starburst patterns around the badge', 'Subtle shadow for depth']
  },
  {
    layout: 'Time-Limited Offer with Clock Icon',
    background: 'Solid with clock icon accents',
    elements: [
      'Clock Icon: Accompanies the urgency message',
      'Headline: Clear and urgent',
      'Details: Short text about the offer',
      'CTA Button: Prominent and actionable'
    ],
    constraints: {
      icon_size_ratio: '1:1 with headline',
      alignment: 'Left or right for icon-text pairing',
      padding: 'Generous around elements for clarity'
    },
    patterns: ['Clock face or gear patterns', 'Textured backdrop for subtle depth']
  }
]

export const LAYOUT_FOOTER = [
  {
    layout: 'Classic Footer with Social Icons',
    background: 'Solid color or subtle gradient',
    elements: [
      'Company Logo on the left',
      'Navigation Links in the center',
      'Social Media Icons on the right',
      'Contact Information below main elements',
      'Unsubscribe Link'
    ],
    constraints: {
      alignment: 'Left for logo, centered for links, right for icons',
      icon_spacing: 'Equal spacing between social icons',
      text_size_ratio: 'Larger for headings, smaller for links'
    },
    patterns: ['Horizontal lines separating sections', 'Subtle dotted or dashed dividers']
  },
  {
    layout: 'Minimalist Footer',
    background: 'Neutral or white background',
    elements: [
      'Centered Company Logo',
      'Single line of Navigation Links',
      'Contact Information at the bottom',
      'Unsubscribe Link'
    ],
    constraints: {
      text_alignment: 'Centered for all elements',
      padding: 'Generous padding around edges',
      font_style: 'Simple and clean'
    },
    patterns: ['Faint geometric shapes in the background', 'Subtle color blocks']
  },
  {
    layout: 'Grid Footer Layout',
    background: 'Solid color or light texture',
    elements: [
      'Grid of Navigation Links',
      'Social Media Icons neatly arranged',
      'Company Information and Unsubscribe Link'
    ],
    constraints: {
      grid_columns: '2 or 3 columns depending on content',
      spacing: 'Equal spacing between grid items',
      alignment: 'Centered or justified within grid cells'
    },
    patterns: ['Checkerboard pattern for sections', 'Soft gradient overlays']
  },
  {
    layout: 'Newsletter Style Footer',
    background: 'Solid color with contrasting accent line',
    elements: ['Company Logo and Tagline', 'Social Media Icons or Links', 'Contact Information', 'Unsubscribe Link'],
    constraints: {
      alignment: 'Centered for logo and tagline, left or right for other elements',
      spacing: 'Consistent spacing between items',
      line_style: 'Bold or colored line for separation'
    },
    patterns: ['Horizontal stripes across the footer', 'Muted diagonal lines']
  },
  {
    layout: 'Layered Footer Layout',
    background: 'Layered effect with varying shades',
    elements: [
      'Top Layer: Company Logo and Social Icons',
      'Middle Layer: Navigation Links',
      'Bottom Layer: Contact Information and Unsubscribe'
    ],
    constraints: {
      layer_spacing: 'Gradual spacing between layers',
      text_alignment: 'Centered or justified within each layer',
      font_weight: 'Varied for emphasis between layers'
    },
    patterns: ['Layered paper effect', 'Subtle 3D patterns for depth']
  },
  {
    layout: 'Columned Footer Layout',
    background: 'Textured or patterned background',
    elements: [
      'Column 1: Company Logo and Tagline',
      'Column 2: Navigation Links',
      'Column 3: Social Media Icons',
      'Column 4: Contact Information and Unsubscribe'
    ],
    constraints: {
      columns: '4 columns with equal width',
      text_alignment: 'Left-aligned within each column',
      column_spacing: 'Consistent spacing between columns'
    },
    patterns: ['Vertical lines separating columns', 'Diagonal or wavy background patterns']
  },
  {
    layout: 'Interactive Footer with Contact Form',
    background: 'Solid color with contrasting elements',
    elements: [
      'Company Logo and Contact Information',
      'Navigation Links and Social Media Icons',
      'Small Contact Form or Feedback Link',
      'Unsubscribe Link'
    ],
    constraints: {
      alignment: 'Centered for form, left or right for other elements',
      element_spacing: 'Adequate spacing for clarity',
      form_style: 'Simple and unobtrusive'
    },
    patterns: ['Subtle grid or dot pattern', 'Faint horizontal or vertical stripes']
  }
]
