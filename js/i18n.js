/* ==========================================================================
   TEKUMA · all interface text in one place (中文 + English)
   --------------------------------------------------------------------------
   - Edit any string below; both languages live side by side.
   - An array = several lines (each item is shown on its own line on desktop).
   - Project names / descriptions are NOT here: see data/projects.json.
   ========================================================================== */
window.TEKUMA_I18N = {
  zh: {
    'meta.title': 'TEKUMA 塔科玛 · 城市创新咨询',
    'meta.description': '塔科玛是一个领先的城市创新咨询公司，桥接战略与设计。',

    'nav.github': 'GitHub',

    /* P1 · Hero */
    'hero.intro': [
      '塔科玛是一个领先的城市创新咨询公司，桥接战略与设计，',
      '帮助政府、开发商和利益相关者塑造韧性、繁荣且富有启发性的城市。',
      '致力于构建全球城市空间的叙事资产，推动城市文明的进化。'
    ],
    'hero.cta': '项目地图',

    /* P2 · Project map */
    'map.title': '项目地图',
    'map.region.global': '全球',
    'map.region.china': '中国',
    'map.region.jjj': '京津冀城市群',
    'map.region.yrd': '长三角城市群',
    'map.region.gba': '粤港澳大湾区',
    'map.year.all': 'ALL',
    'map.count': '{n} 个项目',
    'map.sample': '示例数据',
    'map.empty': '当前筛选下暂无项目',
    'map.view': '查看项目',
    'map.zoom': '放大查看',
    'map.more': '另有 {n} 个项目',
    'map.credit': '地图数据 © OpenStreetMap 贡献者 · Protomaps · 阿里云 DataV',
    'map.hint.pc': '按住 Ctrl 并滚动以缩放地图',
    'map.hint.mac': '按住 ⌘ 并滚动以缩放地图',
    'map.hint.touch': '双指移动或缩放地图',
    'map.zoomin': '放大',
    'map.zoomout': '缩小',
    'map.nowebgl': '当前浏览器无法显示交互地图',

    /* P3 · About + services */
    'about.kicker': '关于塔科玛',
    'about.intro': [
      '塔科玛是一个加速城市创新的引擎，由一群技术专家、未来学家和设计师驱动。',
      '从初步战略制定到实施，我们的跨学科团队在四个综合实践领域提供端到端的咨询服务。'
    ],
    'service.label': '服务',
    'service.brand': '塔科玛',
    'service.strategy': '战略',
    'service.design': '设计',
    'service.innovation': '创新',
    'service.incubation': '孵化',
    'service.strategy.text': '我们融汇数十年城市营造的艺术与科学经验，结合前沿技术与城市数据分析，为区域、城市与场所的转型制定清晰且可落地的战略。',
    'service.strategy.items': ['城市创新与概念战略', '城市品牌与叙事战略', '空间与数字战略', '财务战略'],
    'service.design.text': '我们以整体性的设计思维，将场所的固有禀赋与其未来潜能相交融，制定兼具美学品质、数字赋能与文化敏感性的功能性开发方案。',
    'service.design.items': ['总体规划', '城市设计'],
    'service.innovation.text': '创新实验室携手麻省理工学院、哈佛大学等顶尖城市研究机构的思想者与创造者，推动城市设计迈向未来，释放其变革潜能。',
    'service.innovation.items': ['研究与开发', '产品创新 · 技术', '核心设计演进'],
    'service.incubation.text': '孵化中心依托我们深厚的专业积累，携手学术创业者与初创企业，致力于将全新的城市开发产品、流程与组织变为现实。',
    'service.incubation.items': ['企业孵化', '共创', '投资与咨询'],

    'footer.copy': '© {year} TEKUMA 塔科玛',

    /* Project detail page */
    'project.back': '返回项目地图',
    'project.service': '服务',
    'project.location': '地点',
    'project.year': '年份',
    'project.region': '区域',
    'project.coords': '坐标',
    'project.sample': '示例数据',
    'project.cover': '图片待补充',
    'project.prev': '上一个',
    'project.next': '下一个',
    'project.layers.hint': '点击叠加',
    'project.layers.done': '点击还原',
    'project.notfound': '未找到该项目',
    'project.notfound.text': '链接可能已失效，请返回项目地图查看全部项目。'
  },

  en: {
    'meta.title': 'TEKUMA · Urban Innovation Consultancy',
    'meta.description': 'A leading urban innovation consultancy bridging strategy and design.',

    'nav.github': 'GitHub',

    'hero.intro': [
      'A leading urban innovation consultancy bridging strategy and design to help ambitious governments, developers, and stakeholders shape cities that are resilient, prosperous, and inspiring.',
      'Committed to building narrative assets for urban spaces worldwide and advancing the evolution of urban civilization.'
    ],
    'hero.cta': 'Project Map',

    'map.title': 'Project Map',
    'map.region.global': 'Global',
    'map.region.china': 'China',
    'map.region.jjj': 'Jing-Jin-Ji',
    'map.region.yrd': 'Yangtze River Delta',
    'map.region.gba': 'Greater Bay Area',
    'map.year.all': 'ALL',
    'map.count': '{n} projects',
    'map.sample': 'Sample data',
    'map.empty': 'No projects match this filter',
    'map.view': 'View project',
    'map.zoom': 'Zoom in',
    'map.more': '{n} more',
    'map.credit': 'Map data © OpenStreetMap contributors · Protomaps · Alibaba DataV',
    'map.hint.pc': 'Ctrl + scroll to zoom the map',
    'map.hint.mac': '⌘ + scroll to zoom the map',
    'map.hint.touch': 'Use two fingers to move the map',
    'map.zoomin': 'Zoom in',
    'map.zoomout': 'Zoom out',
    'map.nowebgl': 'This browser cannot display the interactive map',

    'about.kicker': 'About TEKUMA',
    'about.intro': [
      'We are an engine for accelerating urban innovation powered by a group of technologists, futurists and designers.',
      'From initial strategy through to implementation, our interdisciplinary team delivers end-to-end advisory across four integrated practice areas.'
    ],
    'service.label': 'Practice',
    'service.brand': 'TEKUMA',
    'service.strategy': 'Strategy',
    'service.design': 'Design',
    'service.innovation': 'Innovation',
    'service.incubation': 'Incubation',
    'service.strategy.text': 'We draw on decades of experience in the art and science of city-making, cutting-edge technology and urban analytics to create clear and actionable strategies for transforming regions, cities and places.',
    'service.strategy.items': ['Urban Innovation & Concept Strategy', 'City Branding & Narrative Strategy', 'Spatial & Digital Strategy', 'Financial Strategy'],
    'service.design.text': 'We cross the inherent attributes of a place with its future potentials by taking a holistic approach to design, formulating functional development solutions that are aesthetically beautiful, digitally enabled, and culturally sensitive.',
    'service.design.items': ['Master Planning', 'Urban Design'],
    'service.innovation.text': 'By collaborating with thinkers and creators from leading urban research institutions, including MIT and Harvard, the Innovation Lab propels urban design into the future, transforming its potential.',
    'service.innovation.items': ['Research & Development', 'Product Innovation – Technology', 'Core Design Evolution'],
    'service.incubation.text': 'This hub focuses on bringing new urban development products, processes, and organizations into being by partnering with academic entrepreneurs and start-up companies, facilitated by our deep expertise.',
    'service.incubation.items': ['Business Incubator', 'Co-creation', 'Investment & Advisory'],

    'footer.copy': '© {year} TEKUMA',

    'project.back': 'Back to Project Map',
    'project.service': 'Service',
    'project.location': 'Location',
    'project.year': 'Year',
    'project.region': 'Region',
    'project.coords': 'Coordinates',
    'project.sample': 'Sample data',
    'project.cover': 'Image to come',
    'project.prev': 'Previous',
    'project.next': 'Next',
    'project.layers.hint': 'Click to layer',
    'project.layers.done': 'Click to reset',
    'project.notfound': 'Project not found',
    'project.notfound.text': 'The link may be out of date. Return to the project map to browse all projects.'
  }
};
